// Stage 4: Chunk preparation for OpenAI
// Formats messages and splits into chunks if needed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError, formatThreadForLLM, chunkThread } from "../_shared/thread-processing-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CONCURRENCY = 5; // Reduced from 10 to 5 to prevent connection pool exhaustion

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
    const { data: jobs, error } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('current_stage', 'chunking')
      .eq('stage_body_cleaned', true)
      .eq('stage_chunked', false)
      .is('chunk_error', null)
      .order('body_cleaned_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No threads to chunk' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get user email for formatting
    const userId = jobs[0].user_id;
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profileData?.email || '';

    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              chunk_attempts: job.chunk_attempts + 1
            })
            .eq('id', job.id);

          const cleaned = job.cleaned_body_data;
          const messages = cleaned?.messages || [];

          // Format messages for LLM
          const script = formatThreadForLLM(messages, userEmail);

          // Chunk the thread
          const chunkData = chunkThread(script, 15); // 15 messages per chunk

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              stage_chunked: true,
              chunked_at: new Date().toISOString(),
              chunks_data: chunkData,
              current_stage: 'summarizing',
              chunk_error: null
            })
            .eq('id', job.id);

          // Enqueue for summarization
          await supabaseAdmin
            .from('thread_summarization_queue')
            .insert({
              thread_id: job.thread_id,
              user_id: job.user_id,
              thread_stage_id: job.id,
              messages: messages,
              user_email: userEmail,
              chunks_data: chunkData,
              requires_map_reduce: chunkData.requires_map_reduce,
              status: 'pending'
            });

          return { success: true, threadId: job.thread_id, chunkCount: chunkData.chunk_count };
        } catch (error) {
          const errorResult = handleStageError(error, job.chunk_attempts, 3);

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: errorResult.shouldRetry ? 'chunking' : 'failed',
              chunk_error: errorResult.errorMessage,
              chunk_attempts: job.chunk_attempts + 1,
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
    console.error('❌ Error in sync-threads-chunker:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

