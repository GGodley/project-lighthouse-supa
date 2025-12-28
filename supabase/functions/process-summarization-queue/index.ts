//
// ⚠️ THIS IS THE UPGRADED process-summarization-queue EDGE FUNCTION WITH FULL EMAIL ANALYSIS ⚠️
// Webhook-driven with atomic locking and rate limit protection
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { ensureCompanyAndCustomer } from '../_shared/company-customer-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

// Process only 1 job at a time to avoid OpenAI rate limits
const MAX_CONCURRENT_JOBS = 1;

// Helper function to update job status with more detail
async function updateJobStatus(supabase: SupabaseClient, jobId: string | number, status: string, details: string | null, attempts?: number) {
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

// Helper to check if there are already jobs being processed (prevent concurrent processing)
async function hasActiveProcessing(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('summarization_jobs')
    .select('id')
    .eq('status', 'processing')
    .limit(1);
  
  if (error) {
    console.error('Error checking for active processing:', error);
    return false; // If we can't check, allow processing (fail open)
  }
  
  return (data?.length || 0) > 0;
}

// Helper to atomically claim a job (prevent duplicate processing)
async function claimJob(supabase: SupabaseClient, jobId: string | number): Promise<boolean> {
  // Atomic update: only update if status is 'pending'
  const { count, error } = await supabase
    .from('summarization_jobs')
    .update({ 
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error(`Error claiming job ${jobId}:`, error);
    return false;
  }
  
  return (count || 0) > 0;
}

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log('🔄 Starting summarization queue processing...');
    
    // FIX: Check if there are already jobs being processed (prevent concurrent processing)
    const hasActive = await hasActiveProcessing(supabaseAdmin);
    if (hasActive) {
      console.log('⏸️ Another instance is already processing jobs. Skipping to avoid rate limits.');
      return new Response(JSON.stringify({ message: 'Another instance is processing. Skipping to avoid rate limits.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200
      });
    }
    
    // FIX: Fetch only 1 job at a time to avoid OpenAI rate limits
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('summarization_jobs')
      .select(`
        *,
        emails (id, body_text, customer_id, user_id)
      `)
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT_JOBS);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: '✅ No pending jobs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    console.log(`📋 Found ${jobs.length} pending job(s) to process.`);

    // Process jobs sequentially (one at a time)
    for (const job of jobs) {
      // FIX: Atomically claim the job (prevent duplicate processing from multiple webhooks)
      const claimed = await claimJob(supabaseAdmin, job.id);
      if (!claimed) {
        console.log(`⏭️ Job ${job.id} was already claimed by another instance. Skipping.`);
        continue;
      }

      const email = job.emails;
      const currentAttempts = (job.attempts || 0) + 1;

      try {
        if (!email || !email.body_text) {
          throw new Error('Email record or body_text is missing.');
        }

        // Get emailBody and Truncate
        const MAX_CHARS = 20000;
        const truncatedBody = email.body_text.length > MAX_CHARS 
          ? email.body_text.substring(0, MAX_CHARS) 
          : email.body_text;

        // Get user_id from email record
        if (!email.user_id) {
          throw new Error('Email record missing user_id');
        }
        const userId = email.user_id;

        // Fetch customer data (including email for resolver)
        const { data: customerData, error: customerError } = await supabaseAdmin
          .from('customers')
          .select('customer_id, company_id, email')
          .eq('customer_id', email.customer_id)
          .single();

        if (customerError || !customerData) {
          throw new Error(`Failed to fetch customer data: ${customerError?.message || 'Customer not found'}`);
        }

        if (!customerData.customer_id) {
          throw new Error('Customer data missing customer_id');
        }

        // Use resolver to ensure company_id exists
        let company_id: string;
        let customer_id: string;
        try {
          const resolved = await ensureCompanyAndCustomer(
            supabaseAdmin,
            customerData.customer_id,
            customerData.email,
            userId
          );
          company_id = resolved.company_id;
          customer_id = resolved.customer_id;
        } catch (resolveError: any) {
          throw new Error(`Failed to resolve company/customer: ${resolveError.message}`);
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

        // FIX: Call Gemini API with retry logic for rate limits
        let responseContent: string | undefined;
        let retries = 0;
        const maxRetries = 3;
        
        // Combine system and user prompts since Gemini doesn't use role-based messages
        const fullPrompt = `${prompt}\n\n${truncatedBody}`;
        
        const model = genAI.getGenerativeModel({
          model: "gemini-3-flash",
          generationConfig: {
            responseMimeType: "application/json",
          },
        });
        
        while (retries < maxRetries) {
          try {
            const result = await model.generateContent(fullPrompt);
            responseContent = result.response.text();
            break; // Success, exit retry loop
          } catch (geminiError: any) {
            retries++;
            
            // Check if it's a rate limit error
            if (geminiError?.status === 429 || geminiError?.message?.includes('rate limit') || geminiError?.message?.includes('RESOURCE_EXHAUSTED')) {
              if (retries >= maxRetries) {
                throw new Error(`Gemini rate limit exceeded after ${maxRetries} retries. Job will be retried later.`);
              }
              
              // Exponential backoff: 2^retries seconds
              const backoffSeconds = Math.pow(2, retries);
              const retryAfter = geminiError?.headers?.['retry-after'] || backoffSeconds;
              console.warn(`⚠️ Gemini rate limit hit. Waiting ${retryAfter}s before retry ${retries}/${maxRetries}...`);
              
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              continue;
            }
            
            // Not a rate limit error, throw immediately
            throw geminiError;
          }
        }

        if (!responseContent) {
          throw new Error("Failed to get completion from Gemini after retries");
        }
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

      } catch (error: any) {
        console.error(`❌ Error processing job ${job.id}:`, error.message);
        
        // FIX: Handle rate limit errors specially - mark for retry instead of failing
        const isRateLimit = error?.status === 429 || 
                           error?.message?.includes('rate limit') ||
                           error?.message?.includes('Rate limit');
        
        if (isRateLimit && currentAttempts < 3) {
          // Reset to pending so it can be retried later
          await updateJobStatus(supabaseAdmin, job.id, 'pending', error.message, currentAttempts);
          console.log(`⏳ Job ${job.id} marked for retry due to rate limit (attempt ${currentAttempts}/3)`);
        } else {
          // Mark as failed
          await updateJobStatus(supabaseAdmin, job.id, 'failed', error.message, currentAttempts);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Processed ${jobs.length} job(s).` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    console.error('❌ Fatal error in process-summarization-queue:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});