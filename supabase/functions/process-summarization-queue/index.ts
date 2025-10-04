//
// ⚠️ THIS IS THE CORRECTED AND OPTIMIZED process-summarization-queue EDGE FUNCTION ⚠️
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

async function generateSummary(bodyText: string): Promise<string | null> {
    try {
        const maxLength = 8000; // Increased limit, closer to what gpt-3.5-turbo can handle
        const truncatedText = bodyText.length > maxLength ? bodyText.substring(0, maxLength) : bodyText;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are an expert assistant that creates concise, one-sentence summaries of emails. Focus only on the main point or action item.' },
                    { role: 'user', content: `Summarize this email:\n\n${truncatedText}` }
                ],
                max_tokens: 150,
                temperature: 0.2,
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('❌ OpenAI API error:', response.status, errorBody);
            return null;
        }

        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content;
        return summary ? summary.trim() : null;
    } catch (error) {
        console.error('❌ Error calling OpenAI API:', error);
        return null;
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
        emails (id, body_text)
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

        const summary = await generateSummary(email.body_text);
        if (!summary) {
          throw new Error('Failed to generate summary from OpenAI.');
        }

        // Update the email with the summary
        const { error: updateEmailError } = await supabaseAdmin
          .from('emails')
          .update({ summary, updated_at: new Date().toISOString() }) // ✅ IMPROVEMENT: Add updated_at
          .eq('id', job.email_id);

        if (updateEmailError) throw updateEmailError;

        // Mark job as completed
        await updateJobStatus(supabaseAdmin, job.id, 'completed', 'Summary generated successfully.');
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