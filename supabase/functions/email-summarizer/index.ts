//
// ⚠️ THIS IS THE UPGRADED email-summarizer EDGE FUNCTION ⚠️
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

    // --- START: Add this new block ---
    // Set a max character limit. 20,000 chars is ~5k tokens, a very safe buffer.
    const MAX_CHARS = 20000; 
    let emailBody = email.body_text;
    
    if (emailBody.length > MAX_CHARS) {
      console.warn(`Email ${email.id} is too long (${emailBody.length} chars). Truncating to ${MAX_CHARS}.`);
      // Cut the email body down to the max size
      emailBody = emailBody.substring(0, MAX_CHARS);
    }
    // --- END: Add this new block ---

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log(`Generating full analysis for email: ${email.id}`);

    // --- UPGRADED PROMPT ---
    const prompt = `
      You are an expert Customer Success Manager assistant.
      Your task is to analyze a customer email and provide a structured summary, key action items, and a detailed sentiment analysis.

      Email Body:
      """
      ${emailBody}
      """

      Instructions:
      Generate a response as a valid JSON object. The customer's sentiment is the most important part.
      Analyze the customer's words, tone, and feedback to determine their sentiment.

      Sentiment Categories & Scores:
      - "Very Positive" (Score: 3): Enthusiastic, explicit praise, clear plans for expansion.
      - "Positive" (Score: 2): Satisfied, complimentary, minor issues resolved, optimistic.
      - "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise.
      - "Negative" (Score: -2): Frustrated, confused, mentioned blockers, unhappy with a feature or price.
      - "Frustrated" (Score: -3): Explicitly angry, threatening to churn, multiple major issues.

      Response Format:
      Return a valid JSON object with exactly four keys:
      
      "summary": A string containing a concise one-sentence summary of the email.
      
      "action_items": An array of strings. Each string is a single action item or follow-up. If none, return an empty array [].
      
      "sentiment": A single string phrase chosen from the Sentiment Categories above (e.g., "Positive", "Negative").
      
      "sentiment_score": The numeric score (e.g., 2, -2) that corresponds to the chosen sentiment.
    `;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Upgraded for better accuracy
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: emailBody } // Re-adding content here for safety, though system prompt is strong
      ],
      response_format: { type: "json_object" }, // Use JSON mode
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("Failed to generate analysis from AI model.");
    }

    console.log("Generated analysis (raw):", responseContent);

    // --- PARSE THE NEW JSON RESPONSE ---
    let summary, actionItems, sentimentText, sentimentScore;
    
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

    } catch (e) {
      console.error("Failed to parse AI JSON response:", e);
      throw new Error("Failed to parse AI response. Raw content: " + responseContent);
    }

    // --- UPDATE DB WITH ALL 4 FIELDS ---
    console.log(`Updating email ${email.id} with full analysis.`);
    
    const { error: updateError } = await supabaseAdmin
      .from('emails')
      .update({
        summary: summary,
        next_steps: actionItems, // This maps to your 'ARRAY' type 'next_steps' column
        sentiment: sentimentText,
        sentiment_score: sentimentScore // This maps to the 'sentiment_score' column we added
      })
      .eq('id', email.id);

    if (updateError) {
      console.error("Database update error:", updateError);
      throw updateError;
    }

    console.log("Successfully updated email with full analysis.");

    return new Response(JSON.stringify({
      message: `Full analysis added to email ${email.id}`
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