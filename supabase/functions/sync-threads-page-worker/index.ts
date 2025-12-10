// Page worker function - processes Gmail API pages and enqueues threads
// Triggered by webhook when new pages are inserted into sync_page_queue

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError } from "../_shared/thread-processing-utils.ts";

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
    // Fetch one pending page job (process 1 at a time to avoid conflicts)
    const { data: pages, error } = await supabaseAdmin
      .from('sync_page_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      throw error;
    }

    if (!pages || pages.length === 0) {
      return new Response(JSON.stringify({ message: 'No pages to process' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const page = pages[0];

    try {
      // Mark as processing
      await supabaseAdmin
        .from('sync_page_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: page.attempts + 1
        })
        .eq('id', page.id);

      // Get user profile for last sync time, blocklist, and latest provider token
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('email, threads_last_synced_at, gmail_access_token')
        .eq('id', page.user_id)
        .single();

      if (profileError || !profileData) {
        throw new Error(`Failed to fetch user profile: ${profileError?.message || 'Profile not found'}`);
      }

      const userEmail = profileData.email || '';
      // Prefer the freshest token from profile; fall back to queued token
      const effectiveToken = profileData.gmail_access_token || page.provider_token;
      if (!effectiveToken) {
        throw new Error('No valid provider token. Please re-authenticate with Google.');
      }
      const profileLastSyncedAt = profileData.threads_last_synced_at;

      // Build Gmail query
      let lastSyncTime: Date;
      if (profileLastSyncedAt) {
        lastSyncTime = new Date(profileLastSyncedAt);
        lastSyncTime = new Date(lastSyncTime.getTime() - (24 * 60 * 60 * 1000)); // Subtract 1 day
      } else {
        lastSyncTime = new Date();
        lastSyncTime.setUTCDate(lastSyncTime.getUTCDate() - 90);
      }

      // Get blocklist
      const { data: blockedDomains } = await supabaseAdmin
        .from('domain_blocklist')
        .select('domain')
        .eq('user_id', page.user_id);

      let exclusionQuery = "";
      if (blockedDomains && blockedDomains.length > 0) {
        exclusionQuery = ' ' + blockedDomains.map(d => `-from:(*@${d.domain})`).join(' ');
      }

      const calendarExclusionQuery = ` -filename:.ics -subject:("Accepted:" OR "Declined:" OR "Tentative:" OR "invitation" OR "Invitation")`;
      const unixTimestamp = Math.floor(lastSyncTime.getTime() / 1000);
      const baseQuery = `after:${unixTimestamp}`;
      const finalQuery = `${baseQuery}${exclusionQuery}${calendarExclusionQuery}`;

      // Build Gmail API URL
      let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(finalQuery)}&maxResults=10`;
      if (page.page_token) {
        listUrl += `&pageToken=${page.page_token}`;
      }

      // Fetch threads from Gmail API
      let listResp = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${effectiveToken}` }
      });

      // Handle 401 Unauthenticated - token expired
      if (listResp.status === 401) {
        const errorText = await listResp.text();
        console.error(`❌ Gmail API authentication failed for user ${page.user_id}. Token may be expired.`);
        
        // Mark page as failed with clear error message (no retry to avoid loops)
        await supabaseAdmin
          .from('sync_page_queue')
          .update({
            status: 'failed',
            error_message: 'Gmail OAuth token expired. Please re-authenticate and try again.',
            attempts: page.attempts + 1
          })
          .eq('id', page.id);

        // Mark sync_job as failed
        await supabaseAdmin
          .from('sync_jobs')
          .update({
            status: 'failed',
            details: `Gmail authentication failed: OAuth token expired. Please re-authenticate with Google and try again.`
          })
          .eq('id', page.sync_job_id);

        throw new Error(`Gmail API authentication failed: OAuth token expired. Please re-authenticate with Google.`);
      }

      if (!listResp.ok) {
        const errorText = await listResp.text();
        throw new Error(`Gmail API failed: ${errorText}`);
      }

      const listJson = await listResp.json();
      const threadIds = listJson.threads?.map((t: any) => t.id).filter(Boolean) || [];

      // FIX: Update total_pages and pages_completed in sync_jobs
      // For the first page, estimate total pages
      if (page.page_number === 1) {
        let estimatedTotalPages = 1;
        if (listJson.nextPageToken) {
          // Conservative estimate: at least 10 pages if there's a next page
          estimatedTotalPages = 10;
        }

        await supabaseAdmin
          .from('sync_jobs')
          .update({
            total_pages: estimatedTotalPages,
            pages_completed: 1
          })
          .eq('id', page.sync_job_id);
        
        console.log(`📊 Updated sync_job ${page.sync_job_id}: total_pages=${estimatedTotalPages}, pages_completed=1`);
      } else {
        // For subsequent pages, increment pages_completed
        const { data: currentJob } = await supabaseAdmin
          .from('sync_jobs')
          .select('pages_completed, total_pages')
          .eq('id', page.sync_job_id)
          .single();

        if (currentJob) {
          const newPagesCompleted = (currentJob.pages_completed || 0) + 1;
          
          // If we've exceeded our estimate and there's still more pages, increase estimate
          let newTotalPages = currentJob.total_pages;
          if (listJson.nextPageToken && newPagesCompleted >= (newTotalPages || 1)) {
            newTotalPages = newPagesCompleted + 5; // Add buffer
            console.log(`📊 Increasing total_pages estimate to ${newTotalPages}`);
          }

          await supabaseAdmin
            .from('sync_jobs')
            .update({
              pages_completed: newPagesCompleted,
              total_pages: newTotalPages
            })
            .eq('id', page.sync_job_id);
          
          console.log(`📊 Updated sync_job ${page.sync_job_id}: pages_completed=${newPagesCompleted}`);
        }
      }

      // Create thread_processing_stages records for each thread
      // (Bulk insert is fine; no webhooks on this table)
      if (threadIds.length > 0) {
        const stageJobs = threadIds.map((threadId: string) => ({
          thread_id: threadId,
          user_id: page.user_id,
          sync_job_id: page.sync_job_id,
          current_stage: 'pending',
          stage_imported: false
        }));

        const { error: stagesError } = await supabaseAdmin
          .from('thread_processing_stages')
          .upsert(stageJobs, {
            onConflict: 'thread_id,sync_job_id',
            ignoreDuplicates: true
          });

        if (stagesError) {
          console.error('Failed to create thread processing stages:', stagesError);
          throw new Error(`Failed to enqueue threads: ${stagesError.message}`);
        }

        console.log(`✅ Enqueued ${threadIds.length} threads for page ${page.page_number}`);

        // Enqueue ONLY the first thread into the processing queue (one webhook)
        const { data: firstThread } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('id')
          .eq('sync_job_id', page.sync_job_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstThread?.id) {
          const { error: queueError } = await supabaseAdmin
            .from('thread_processing_queue')
            .insert({
              thread_stage_id: firstThread.id,
              sync_job_id: page.sync_job_id
            });

          if (queueError && queueError.code !== '23505') {
            console.error('Failed to enqueue first thread into processing queue:', queueError);
            throw queueError;
          } else {
            console.log(`🚀 Enqueued first thread ${firstThread.id} into processing queue`);
          }
        }
      }

      // If there's a next page, enqueue it
      if (listJson.nextPageToken) {
        const nextPageIdempotencyKey = `${page.sync_job_id}-page-${page.page_number + 1}`;

        const { error: nextPageError } = await supabaseAdmin
          .from('sync_page_queue')
          .insert({
            sync_job_id: page.sync_job_id,
            user_id: page.user_id,
            provider_token: effectiveToken, // use freshest token
            page_token: listJson.nextPageToken,
            page_number: page.page_number + 1,
            idempotency_key: nextPageIdempotencyKey,
            next_retry_at: new Date().toISOString() // FIX: Set to NOW() so it's immediately processable
          });

        if (nextPageError) {
          // If it's a duplicate key error, that's okay (idempotency)
          if (nextPageError.code !== '23505' && !nextPageError.message?.includes('duplicate key')) {
            console.error('Failed to enqueue next page:', nextPageError);
            throw nextPageError;
          }
        } else {
          console.log(`✅ Enqueued next page (${page.page_number + 1})`);
        }
      } else {
        // No more pages - update sync_job when all threads are done (handled by completion checker)
        console.log(`✅ No more pages for sync job ${page.sync_job_id}`);
      }

      // Mark page as completed
      await supabaseAdmin
        .from('sync_page_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', page.id);

      return new Response(JSON.stringify({
        message: 'Page processed successfully',
        pageNumber: page.page_number,
        threadsEnqueued: threadIds.length,
        hasNextPage: !!listJson.nextPageToken
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      const errorResult = handleStageError(error, page.attempts, page.max_attempts);

      await supabaseAdmin
        .from('sync_page_queue')
        .update({
          status: errorResult.shouldRetry ? 'retrying' : 'failed',
          error_message: errorResult.errorMessage,
          next_retry_at: errorResult.nextRetryAt?.toISOString() || null,
          attempts: page.attempts + 1
        })
        .eq('id', page.id);

      if (!errorResult.shouldRetry) {
        // Mark sync_job as failed if page failed permanently
        await supabaseAdmin
          .from('sync_jobs')
          .update({
            status: 'failed',
            details: `Page ${page.page_number} failed after ${page.max_attempts} attempts: ${errorResult.errorMessage}`
          })
          .eq('id', page.sync_job_id);
      }

      throw error;
    }

  } catch (error) {
    console.error('❌ Error in sync-threads-page-worker:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

