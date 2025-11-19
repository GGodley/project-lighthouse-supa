//
// ⚠️ THIS IS THE UPGRADED process-summarization-queue EDGE FUNCTION WITH FULL EMAIL ANALYSIS ⚠️
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Helper function to update job status with more detail
async function updateJobStatus(supabase: SupabaseClient, jobId: number, status: string, details: string | null, attempts?: number) {
  const updatePayload: { status: string; details: string | null; updated_at: string; attempts?: number } = {
    status,
    details,
    updated_at: new Date().toISOString(),
  };
  if (attempts !== undefined) {
    updatePayload.attempts = attempts;
  }
  
  const { error } = await supabase
    .from('summarization_jobs')
    .update(updatePayload)
    .eq('id', jobId);

  if (error) {
    console.error(`❌ FATAL: Error updating job ${jobId} status to ${status}:`, error);
  }
}

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log('🔄 Starting summarization queue processing...');
    
    // Fetch a batch of jobs that are pending and have not exceeded the retry limit
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('summarization_jobs')
      .select(`
        *,
        emails (id, body_text, customer_id)
      `)
      .eq('status', 'pending')
      .lt('attempts', 3) // ✅ IMPROVEMENT: Only fetch jobs with less than 3 attempts
      .order('created_at', { ascending: true })
      .limit(5);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: '✅ No pending jobs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    console.log(`📋 Found ${jobs.length} pending jobs to process.`);

    for (const job of jobs) {
      const email = job.emails;
      const currentAttempts = job.attempts + 1;

      try {
        if (!email || !email.body_text) {
          throw new Error('Email record or body_text is missing.');
        }

        // Get emailBody and Truncate
        const MAX_CHARS = 20000;
        const truncatedBody = email.body_text.length > MAX_CHARS 
          ? email.body_text.substring(0, MAX_CHARS) 
          : email.body_text;

        // Fetch customer_id and company_id
        const { data: customerData, error: customerError } = await supabaseAdmin
          .from('customers')
          .select('customer_id, company_id')
          .eq('customer_id', email.customer_id)
          .single();

        if (customerError || !customerData) {
          throw new Error(`Failed to fetch customer data: ${customerError?.message || 'Customer not found'}`);
        }

        const { customer_id, company_id } = customerData;
        if (!customer_id || !company_id) {
          throw new Error('Missing customer_id or company_id');
        }

        // Define the New OpenAI Prompt
        const prompt = `
  You are an expert Customer Success Manager assistant.
  Your task is to analyze a customer email and provide a structured summary, key action items, detailed sentiment analysis, and extract any feature requests.

  Email Body:
  """
  ${truncatedBody} 
  """

  Instructions:
  Generate a response as a valid JSON object.
  Analyze the customer's words, tone, and feedback.

  Sentiment Categories & Scores:
  - "Very Positive" (Score: 3)
  - "Positive" (Score: 2)
  - "Neutral" (Score: 0)
  - "Negative" (Score: -2)
  - "Frustrated" (Score: -3)

  Feature Request Urgency:
  If you find a feature request, assign an urgency:
  - "Low": A "nice to have" suggestion.
  - "Medium": A feature that would provide significant value.
  - "High": A critical request, blocker, or deal-breaker.

  Response Format:
  Return a valid JSON object with exactly five keys:
  
  "summary": A string containing a concise one-sentence summary of the email.
  
  "action_items": An array of strings. Each string is a single action item. If none, return an empty array [].
  
  "sentiment": A single string phrase chosen from the Sentiment Categories above.
  
  "sentiment_score": The numeric score that corresponds to the chosen sentiment.

  "feature_requests": An array of objects. Each object must have three keys:
    - "feature_title": A concise, generic title for the feature (e.g., "API Rate Limiting", "Mobile App Improvements").
    - "request_details": A string summary of the specific feature being requested.
    - "urgency": A string chosen from the Urgency levels ('Low', 'Medium', 'High'). 
  If no feature requests are found, return an empty array [].
`;

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: truncatedBody }
          ],
          response_format: { type: "json_object" },
        });

        const responseContent = completion.choices[0]?.message?.content;
        if (!responseContent) {
          throw new Error("Failed to generate analysis from AI model.");
        }

        // Parse the Full JSON Response
        let summary, actionItems, sentimentText, sentimentScore;
        let featureRequests: Array<{feature_title: string, request_details: string, urgency: string}> = [];
        
        try {
          const parsed = JSON.parse(responseContent);

          summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : 'No summary generated.';
          
          actionItems = Array.isArray(parsed.action_items) ? parsed.action_items : [];

          sentimentText = [
            'Very Positive',
            'Positive',
            'Neutral',
            'Negative',
            'Frustrated'
          ].includes(parsed.sentiment) ? parsed.sentiment : 'Neutral';

          const score = parsed.sentiment_score;
          sentimentScore = typeof score === 'number' && score >= -3 && score <= 3 ? score : 1;

          // Parse feature requests with validation
          if (Array.isArray(parsed.feature_requests)) {
            featureRequests = parsed.feature_requests.filter(req => 
              typeof req === 'object' && 
              req !== null &&
              typeof req.feature_title === 'string' &&
              typeof req.request_details === 'string' &&
              ['Low', 'Medium', 'High'].includes(req.urgency)
            );
          }

        } catch (e) {
          console.error("Failed to parse AI JSON response:", e);
          throw new Error("Failed to parse AI response. Raw content: " + responseContent);
        }

        // Update the emails Table
        const { error: updateEmailError } = await supabaseAdmin
          .from('emails')
          .update({
            summary: summary,
            next_steps: actionItems,
            sentiment: sentimentText,
            sentiment_score: sentimentScore
          })
          .eq('id', job.email_id);

        if (updateEmailError) throw updateEmailError;

        // Add Feature Request Saving Logic using shared utility
        if (featureRequests.length > 0) {
          const { saveFeatureRequests } = await import('../_shared/feature-request-utils.ts');
          
          const result = await saveFeatureRequests(
            supabaseAdmin,
            featureRequests.map(req => ({
              feature_title: req.feature_title,
              request_details: req.request_details,
              urgency: req.urgency as 'Low' | 'Medium' | 'High'
            })),
            {
                  company_id: company_id,
                  customer_id: customer_id,
              source: 'email',
                  email_id: job.email_id
            }
          );

          if (result.success) {
            console.log(`✅ Successfully saved ${result.savedCount} feature requests for email ${job.email_id}`);
          } else {
            console.warn(`⚠️ Saved ${result.savedCount} feature requests with ${result.errors.length} errors for email ${job.email_id}`);
          }
        }

        // Mark job as completed
        await updateJobStatus(supabaseAdmin, job.id, 'completed', 'Full analysis generated successfully.');
        console.log(`✅ Successfully processed job ${job.id} for email ${job.email_id}`);

      } catch (error) {
        console.error(`❌ Error processing job ${job.id}:`, error.message);
        await updateJobStatus(supabaseAdmin, job.id, 'failed', error.message, currentAttempts);
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Processed ${jobs.length} jobs.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error) {
    console.error('❌ Fatal error in process-summarization-queue:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});