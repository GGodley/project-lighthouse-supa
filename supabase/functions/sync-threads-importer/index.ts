// Stage 1: Import thread data from Gmail API
// Fetches full thread details and saves raw data

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError } from "../_shared/thread-processing-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CONCURRENCY = 10; // Process 10 threads in parallel

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // Fetch pending import jobs
    const { data: jobs, error } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('current_stage', 'pending')
      .eq('stage_imported', false)
      .is('import_error', null)
      .order('created_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No threads to import' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get provider_token from sync_page_queue (via sync_job_id)
    // We need to get it from the first page job
    const syncJobId = jobs[0]?.sync_job_id;
    if (!syncJobId) {
      throw new Error('Missing sync_job_id in thread processing stage');
    }

    const { data: pageJob } = await supabaseAdmin
      .from('sync_page_queue')
      .select('provider_token')
      .eq('sync_job_id', syncJobId)
      .eq('page_number', 1)
      .single();

    if (!pageJob?.provider_token) {
      throw new Error('Could not find provider_token for sync job');
    }

    const providerToken = pageJob.provider_token;

    // Process threads in parallel
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          // Update status
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: 'importing',
              import_attempts: job.import_attempts + 1
            })
            .eq('id', job.id);

          // Fetch thread from Gmail API
          const threadResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${job.thread_id}?format=full`,
            {
              headers: {
                Authorization: `Bearer ${providerToken}`
              }
            }
          );

          if (!threadResp.ok) {
            throw new Error(`Gmail API failed: ${await threadResp.text()}`);
          }

          const threadData = await threadResp.json();

          // Save raw data and mark as imported
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              stage_imported: true,
              imported_at: new Date().toISOString(),
              raw_thread_data: threadData,
              current_stage: 'preprocessing',
              import_error: null
            })
            .eq('id', job.id);

          return { success: true, threadId: job.thread_id };
        } catch (error) {
          const errorResult = handleStageError(error, job.import_attempts, 3);

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: errorResult.shouldRetry ? 'pending' : 'failed',
              import_error: errorResult.errorMessage,
              import_attempts: job.import_attempts + 1,
              next_retry_at: errorResult.nextRetryAt?.toISOString() || null
            })
            .eq('id', job.id);

          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return new Response(JSON.stringify({
      processed: jobs.length,
      successful,
      failed
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Error in sync-threads-importer:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

