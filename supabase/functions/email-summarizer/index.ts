import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4";

// CORS headers for handling OPTIONS requests and allowing cross-origin calls
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Extract the email record from the request payload
    const payload = await req.json();
    const record = payload.record;
    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: "Invalid payload. Missing 'record' or 'record.id'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id: emailId, subject, body_text, sender, snippet } = record;

    // 2. Initialize OpenAI client from environment variables
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      throw new Error("Missing environment variable: OPENAI_API_KEY");
    }
    const openai = new OpenAI({ apiKey: openAiKey });

    // 3. Construct a concise and effective prompt for summarization
    const promptContent = [
      subject ? `Subject: ${subject}` : '',
      sender ? `From: ${sender}` : '',
      snippet ? `Snippet: ${snippet}` : '',
      body_text ? `Body:\n${String(body_text).slice(0, 4000)}` : ''
    ].filter(Boolean).join("\n\n");
    
    const prompt = `Summarize the following email in at most 2 concise lines. Focus on the key intent and any next steps.\n\n${promptContent}`;

    // 4. Call OpenAI to generate the summary
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an expert assistant that writes concise two-line email summaries." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    let summary = (completion.choices?.[0]?.message?.content ?? "").trim();
    // Enforce the two-line limit
    summary = summary.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 2).join("\n");
    
    if (!summary) {
        // If summary is empty, we can choose to do nothing or log it
        console.log(`OpenAI returned an empty summary for email ID: ${emailId}`);
        return new Response(JSON.stringify({ ok: true, message: "Empty summary, no update needed." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 5. Initialize Supabase client, preserving the service_role authorization
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        // This is the crucial part: it passes the Authorization header from the
        // trigger's request to the Supabase client.
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 6. Update the 'emails' table with the new summary
    const { error: updateError } = await supabase
      .from("emails")
      .update({ summary: summary })
      .eq("id", emailId);

    if (updateError) {
      throw new Error(`Supabase update error: ${updateError.message}`);
    }

    // 7. Return a success response
    return new Response(JSON.stringify({ ok: true, summary_added_to_id: emailId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    // Catch-all error handler for any unexpected issues
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


