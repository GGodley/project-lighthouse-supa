import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EmailRecord = {
  id: number | string;
  customer_id?: string | number | null;
  summary?: string | null;
};

async function classifySentiment(summaryText: string): Promise<'Positive' | 'Negative' | 'Neutral'> {
  const text = (summaryText || '').trim();
  if (!text) return 'Neutral';

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    console.warn("GEMINI_API_KEY not set. Defaulting to Neutral.");
    return 'Neutral';
  }

  const prompt = `Classify the sentiment of the provided text as exactly one of: Positive, Negative, Neutral. Respond with only that single word.\n\nText: ${text}`;

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 5,
      },
    }),
  });

  if (!resp.ok) {
    console.error('Gemini sentiment error:', await resp.text());
    return 'Neutral';
  }

  const json = await resp.json();
  const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  const normalized = raw.toLowerCase();
  if (normalized.includes('positive')) return 'Positive';
  if (normalized.includes('negative')) return 'Negative';
  return 'Neutral';
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
    const record: EmailRecord | null = payload?.record ?? payload?.new ?? null;
    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: 'Missing record or id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const summary = (record.summary ?? '').toString();
    const sentiment = await classifySentiment(summary);

    // 1) Update the email sentiment
    const { error: updateEmailErr } = await supabaseAdmin
      .from('emails')
      .update({ sentiment })
      .eq('id', record.id);

    if (updateEmailErr) {
      console.error('Failed to update email sentiment:', updateEmailErr);
      return new Response(JSON.stringify({ error: 'Failed to update email sentiment' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 2) Recalculate the customer's overall sentiment, if customer_id exists
    const customerId = record.customer_id;
    if (customerId) {
      const { data: sentiments, error: listErr } = await supabaseAdmin
        .from('emails')
        .select('sentiment')
        .eq('customer_id', customerId);

      if (listErr) {
        console.error('Failed to list customer sentiments:', listErr);
      } else {
        // Priority: any Negative => Negative; else any Positive => Positive; else Neutral
        let hasNegative = false;
        let hasPositive = false;
        for (const row of sentiments ?? []) {
          const s = (row as { sentiment?: string | null }).sentiment ?? '';
          if (s.toLowerCase() === 'negative') hasNegative = true;
          if (s.toLowerCase() === 'positive') hasPositive = true;
        }
        const overall: 'Positive' | 'Negative' | 'Neutral' = hasNegative ? 'Negative' : hasPositive ? 'Positive' : 'Neutral';

        const { error: updateCustomerErr } = await supabaseAdmin
          .from('customers')
          .update({ overall_sentiment: overall })
          .eq('id', customerId);

        if (updateCustomerErr) {
          console.error('Failed to update overall_sentiment:', updateCustomerErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, emailId: record.id }), {
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


