// Stage 4: Chunk preparation for OpenAI
// Formats messages and splits into chunks if needed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError, formatThreadForLLM, chunkThread } from "../_shared/thread-processing-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// FIX: Process only 1 job at a time to avoid statement timeouts and reduce DB load
const CONCURRENCY = 1;

// Helper to atomically claim a job (prevent duplicate processing)
async function claimJob(supabase: any, jobId: string): Promise<boolean> {
  // Atomic update: only update if status is 'chunking' and not already processing
  const { count, error } = await supabase
    .from('thread_processing_stages')
    .update({ 
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)
    .eq('current_stage', 'chunking')
    .eq('stage_chunked', false)
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error(`Error claiming job ${jobId}:`, error);
    return false;
  }
  
  return (count || 0) > 0;
}

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
    // FIX: Fetch only 1 job at a time to process sequentially
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

    // Get user email for formatting (only need to fetch once)
    const userId = jobs[0].user_id;
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profileData?.email || '';

    // FIX: Process jobs sequentially (one at a time) to avoid timeouts
    const results = [];
    for (const job of jobs) {
      // FIX: Atomically claim the job to prevent duplicate processing
      const claimed = await claimJob(supabaseAdmin, job.id);
      if (!claimed) {
        console.log(`⏭️ Job ${job.id} was already claimed by another instance. Skipping.`);
        results.push({ success: false, threadId: job.thread_id, reason: 'already_claimed' });
        continue;
      }

      try {
        // Increment attempts
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            chunk_attempts: (job.chunk_attempts || 0) + 1
          })
          .eq('id', job.id);

        const cleaned = job.cleaned_body_data;
        const messages = cleaned?.messages || [];

        if (messages.length === 0) {
          throw new Error('No messages found in cleaned body data');
        }

        // FIX: Add timeout protection for CPU-intensive operations
        const processWithTimeout = async () => {
          // Format messages for LLM (CPU intensive for large threads)
          const script = formatThreadForLLM(messages, userEmail);

          // Chunk the thread (CPU intensive for large threads)
          const chunkData = chunkThread(script, 15); // 15 messages per chunk

          return { script, chunkData };
        };

        // Set a timeout of 50 seconds (Edge Functions have 60s timeout)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Chunking operation timed out after 50 seconds')), 50000);
        });

        const { chunkData } = await Promise.race([
          processWithTimeout(),
          timeoutPromise
        ]) as { chunkData: any };

        // Update stage as chunked
        const { error: updateError } = await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            stage_chunked: true,
            chunked_at: new Date().toISOString(),
            chunks_data: chunkData,
            current_stage: 'summarizing',
            chunk_error: null
          })
          .eq('id', job.id);

        if (updateError) {
          throw updateError;
        }

        // Enqueue for summarization
        const { error: insertError } = await supabaseAdmin
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

        if (insertError) {
          // If insert fails, we still want to mark as chunked, but log the error
          console.error(`⚠️ Failed to enqueue thread ${job.thread_id} for summarization:`, insertError);
          // Don't throw - the chunking succeeded, summarization can be retried
        }

        results.push({ success: true, threadId: job.thread_id, chunkCount: chunkData.chunk_count });
        console.log(`✅ Successfully chunked thread ${job.thread_id} into ${chunkData.chunk_count} chunks`);

      } catch (error: any) {
        console.error(`❌ Error processing job ${job.id} (thread ${job.thread_id}):`, error);
        
        const errorResult = handleStageError(error, job.chunk_attempts || 0, 3);

        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: errorResult.shouldRetry ? 'chunking' : 'failed',
            chunk_error: errorResult.errorMessage,
            chunk_attempts: (job.chunk_attempts || 0) + 1,
            next_retry_at: errorResult.nextRetryAt?.toISOString() || null
          })
          .eq('id', job.id);

        results.push({ success: false, threadId: job.thread_id, error: errorResult.errorMessage });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({
      processed: jobs.length,
      successful,
      failed,
      results
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

