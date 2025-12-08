// Completion checker - verifies all threads are processed and marks sync_job as completed
// Runs periodically to check if sync jobs are ready to be marked as completed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

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
    // Find running sync jobs
    const { data: runningJobs, error: jobsError } = await supabaseAdmin
      .from('sync_jobs')
      .select('id, user_id')
      .eq('status', 'running');

    if (jobsError) {
      throw jobsError;
    }

    if (!runningJobs || runningJobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No running sync jobs to check' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const completedJobs: number[] = [];

    for (const job of runningJobs) {
      // Check if all pages are completed
      const { data: pages, error: pagesError } = await supabaseAdmin
        .from('sync_page_queue')
        .select('status')
        .eq('sync_job_id', job.id);

      if (pagesError) {
        console.error(`Error checking pages for job ${job.id}:`, pagesError);
        continue;
      }

      if (!pages || pages.length === 0) {
        // No pages yet, skip
        continue;
      }

      const hasPendingPages = pages.some(p => p.status === 'pending' || p.status === 'processing' || p.status === 'retrying');
      if (hasPendingPages) {
        // Still processing pages
        continue;
      }

      // All pages are done, check if all threads are completed
      const { data: threads, error: threadsError } = await supabaseAdmin
        .from('thread_processing_stages')
        .select('current_stage')
        .eq('sync_job_id', job.id);

      if (threadsError) {
        console.error(`Error checking threads for job ${job.id}:`, threadsError);
        continue;
      }

      if (!threads || threads.length === 0) {
        // No threads yet, skip
        continue;
      }

      const hasIncompleteThreads = threads.some(t => 
        t.current_stage !== 'completed' && t.current_stage !== 'failed'
      );

      if (hasIncompleteThreads) {
        // Still processing threads
        continue;
      }

      // All pages and threads are done - mark job as completed
      const { error: updateError } = await supabaseAdmin
        .from('sync_jobs')
        .update({
          status: 'completed',
          details: `Sync completed: ${threads.filter(t => t.current_stage === 'completed').length} threads processed successfully`
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`Error marking job ${job.id} as completed:`, updateError);
      } else {
        completedJobs.push(job.id);
        
        // Update threads_last_synced_at in profiles table
        await supabaseAdmin
          .from('profiles')
          .update({ threads_last_synced_at: new Date().toISOString() })
          .eq('id', job.user_id);
      }
    }

    return new Response(JSON.stringify({
      checked: runningJobs.length,
      completed: completedJobs.length,
      completedJobIds: completedJobs
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Error in sync-threads-completion-checker:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

