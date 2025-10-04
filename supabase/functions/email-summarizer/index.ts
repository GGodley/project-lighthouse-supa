//
// ⚠️ THIS IS THE NEW, DECOUPLED email-summarizer EDGE FUNCTION ⚠️
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received payload:", JSON.stringify(payload, null, 2));
    
    // Handle different payload structures
    let email;
    if (payload.record) {
      email = payload.record;
    } else if (payload.id && payload.body_text) {
      email = payload;
    } else {
      throw new Error("Invalid payload structure. Expected 'record' object or direct email object with 'id' and 'body_text'.");
    }
    
    if (!email || !email.id || !email.body_text) {
      throw new Error("Invalid payload. Email object with 'id' and 'body_text' is required.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log("Generating summary for email:", email.id);
    console.log("Email body length:", email.body_text?.length || 0);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: "Summarize this email concisely in one sentence." }, { role: "user", content: email.body_text }],
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error("Failed to generate summary from AI model.");
    }
    
    console.log("Generated summary:", summary);

    // This is now the function's only database operation.
    console.log("Updating email with summary:", email.id);
    const { error: updateError } = await supabaseAdmin
      .from('emails')
      .update({ summary: summary })
      .eq('id', email.id);
      
    if (updateError) {
      console.error("Database update error:", updateError);
      throw updateError;
    }
    
    console.log("Successfully updated email with summary");

    return new Response(JSON.stringify({ message: `Summary added to email ${email.id}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      name: error.name 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});