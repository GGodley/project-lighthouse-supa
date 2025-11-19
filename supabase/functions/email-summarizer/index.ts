//
// ⚠️ THIS IS THE UPGRADED email-summarizer EDGE FUNCTION WITH FEATURE REQUESTS ⚠️
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1"; // Or your current version

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});

serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received payload:", JSON.stringify(payload, null, 2));

    let email;
    if (payload.record) {
      email = payload.record;
    } else if (payload.id && payload.body_text) {
      email = payload;
    } else {
      throw new Error("Invalid payload structure.");
    }

    if (!email || !email.id || !email.body_text) {
      throw new Error("Invalid payload. Email object with 'id' and 'body_text' is required.");
    }

    // Set a max character limit. 20,000 chars is ~5k tokens, a very safe buffer.
    const MAX_CHARS = 20000; 
    let emailBody = email.body_text;
    
    if (emailBody.length > MAX_CHARS) {
      console.warn(`Email ${email.id} is too long (${emailBody.length} chars). Truncating to ${MAX_CHARS}.`);
      emailBody = emailBody.substring(0, MAX_CHARS);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Step 1: Fetch customer_id and company_id
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

    console.log(`Generating full analysis for email: ${email.id}`);

    // Step 2: Updated OpenAI Prompt with Feature Requests
    const prompt = `
  You are an expert Customer Success Manager assistant.
  Your task is to analyze a customer email and provide a structured summary, key action items, detailed sentiment analysis, and extract any feature requests.

  Email Body:
  """
  ${emailBody} 
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
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Upgraded for better accuracy
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: emailBody }
      ],
      response_format: { type: "json_object" }, // Use JSON mode
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("Failed to generate analysis from AI model.");
    }

    console.log("Generated analysis (raw):", responseContent);

    // Step 3: Updated Response Parsing with Feature Requests
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

    // Step 4: Insert Feature Request Logic using shared utility
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
              email_id: email.id
        }
      );

      if (result.success) {
        console.log(`✅ Successfully saved ${result.savedCount} feature requests for email ${email.id}`);
      } else {
        console.warn(`⚠️ Saved ${result.savedCount} feature requests with ${result.errors.length} errors for email ${email.id}`);
      }
    }

    // Update email with analysis
    console.log(`Updating email ${email.id} with full analysis.`);
    
    const { error: updateError } = await supabaseAdmin
      .from('emails')
      .update({
        summary: summary,
        next_steps: actionItems,
        sentiment: sentimentText,
        sentiment_score: sentimentScore
      })
      .eq('id', email.id);

    if (updateError) {
      console.error("Database update error:", updateError);
      throw updateError;
    }

    console.log("Successfully updated email with full analysis.");

    return new Response(JSON.stringify({
      message: `Full analysis added to email ${email.id}`,
      feature_requests_processed: featureRequests.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      name: error.name
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});