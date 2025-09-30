import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calls OpenAI to summarize the provided text into a concise summary
async function summarizeText(bodyText: string): Promise<string> {
  const text = (bodyText || '').trim();
  if (!text) return '';

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    console.warn("OPENAI_API_KEY not set. Returning first 200 chars as summary.");
    return text.slice(0, 200);
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that writes concise, neutral summaries (1-3 sentences max). Do not include greetings or sign-offs.' },
        { role: 'user', content: `Summarize this email in 1-3 sentences:\n\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 120,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("OpenAI summarizer error:", errText);
    return text.slice(0, 200);
  }

  const json = await resp.json();
  const summary: string = json.choices?.[0]?.message?.content?.trim() ?? '';
  return summary || text.slice(0, 200);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload = await req.json();
    const record = payload?.record ?? payload?.new ?? null;
    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing record in payload' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const emailId = record.id as number | string | undefined;
    const bodyText: string = record.body_text ?? record.body ?? '';
    if (!emailId) {
      return new Response(JSON.stringify({ error: 'Missing email id in record' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Generate summary
    const summary = await summarizeText(bodyText);

    // Update the email row with the summary
    const { error: updateErr } = await supabaseAdmin
      .from('emails')
      .update({ summary })
      .eq('id', emailId);

    if (updateErr) {
      console.error('Failed to update email summary:', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to update email summary' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true, emailId, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

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


