import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get sentiment from an AI model
const getSentiment = async (text: string) => {
  // Return neutral for very short or empty summaries
  if (!text || text.trim().length < 10) {
    return 'neutral';
  }
  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      console.warn("OPENAI_API_KEY not set. Defaulting to neutral.");
      return 'neutral';
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a sentiment analysis expert for customer success. Classify the following email summary as "positive", "negative", or "neutral". Respond with only one of these three words in lowercase.',
          },
          {
            role: 'user',
            content: text,
          }
        ],
        temperature: 0, // Set to 0 for deterministic results
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API request failed:", await response.text());
      return 'neutral'; // Default to neutral on API failure
    }

    const json = await response.json();
    const sentiment = json.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Validate the response is one of the expected values
    if (['positive', 'negative', 'neutral'].includes(sentiment)) {
      return sentiment;
    }
    return 'neutral';
  } catch (error) {
    console.error("Error during sentiment analysis:", error);
    return 'neutral'; // Default to neutral on any exception
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // The Supabase Admin client is used to perform privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the updated email record from the trigger's payload
    const payload = await req.json();
    const updatedEmail = payload.record;

    // 1. Analyze sentiment directly from the summary in the payload
    const sentiment = await getSentiment(updatedEmail.summary);

    // 2. Update the sentiment for the specific email that was updated
    const { error: updateEmailError } = await supabaseAdmin
      .from('emails')
      .update({ sentiment: sentiment })
      .eq('id', updatedEmail.id);

    if (updateEmailError) throw updateEmailError;

    // 3. Recalculate and update the overall sentiment for the associated customer
    const customerId = updatedEmail.customer_id;
    if (customerId) {
      // Get all emails for this customer
      const { data: customerEmails, error: emailsError } = await supabaseAdmin
        .from('emails')
        .select('sentiment')
        .eq('customer_id', customerId);
      
      if (emailsError) throw emailsError;

      // Calculate the new overall sentiment
      const sentimentCounts = { positive: 0, negative: 0, neutral: 0 } as Record<'positive' | 'negative' | 'neutral', number>;
      customerEmails.forEach((email: { sentiment: 'positive' | 'negative' | 'neutral' | null }) => {
        if (email.sentiment && sentimentCounts[email.sentiment] !== undefined) {
          sentimentCounts[email.sentiment]++;
        }
      });

      let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (sentimentCounts.negative > 0) {
        overallSentiment = 'negative'; // Prioritize negative sentiment
      } else if (sentimentCounts.positive > 0) {
        overallSentiment = 'positive';
      }

      // Update the customer's profile
      await supabaseAdmin
        .from('customers')
        .update({ overall_sentiment: overallSentiment })
        .eq('id', customerId);
    }

    return new Response(JSON.stringify({ success: true, message: `Sentiment processed for email ${updatedEmail.id}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});


