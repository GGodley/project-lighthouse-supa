// Lightweight thread ingestion function
// Fetches email threads from Gmail API and saves raw data to database
// Does NOT perform entity creation (companies/customers) or AI summarization

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Limit the number of threads processed per run to avoid CPU timeouts
const MAX_THREADS_PER_RUN = 50;

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

  let jobId: number | null = null;

  try {
    // Parse request body
    const { userId, providerToken, jobId: providedJobId } = await req.json();

    if (!userId || !providerToken) {
      return new Response(JSON.stringify({ error: "Missing userId or providerToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- Zombie Job Cleanup: handle stuck 'running' jobs for this user ---
    type RunningJob = {
      id: number;
      created_at: string;
      status: string;
    };

    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const now = new Date();

    const { data: runningJobs, error: runningJobsError } = await supabaseAdmin
      .from("sync_jobs")
      .select("id, created_at, status")
      .eq("user_id", userId)
      .eq("status", "running")
      .order("created_at", { ascending: false });

    if (runningJobsError) {
      throw new Error(`Failed to check existing sync jobs: ${runningJobsError.message}`);
    }

    if (runningJobs && runningJobs.length > 0) {
      const latestJob = runningJobs[0] as RunningJob;
      const createdAt = new Date(latestJob.created_at);
      const ageMs = now.getTime() - createdAt.getTime();

      if (ageMs > TEN_MINUTES_MS) {
        console.log(
          `🧹 Cleaning up zombie sync job ${latestJob.id} for user ${userId} (age: ${Math.round(
            ageMs / 1000
          )}s)`
        );

        const { error: cleanupError } = await supabaseAdmin
          .from("sync_jobs")
          .update({
            status: "failed",
            details: "System Cleanup: Job timed out or crashed previously",
          })
          .eq("id", latestJob.id);

        if (cleanupError) {
          console.warn(
            `⚠️ Failed to mark zombie sync job ${latestJob.id} as failed: ${cleanupError.message}`
          );
        }
        // Continue and create a new job below
      } else {
        const remainingMs = TEN_MINUTES_MS - ageMs;
        const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

        console.log(
          `⏳ Active sync job ${latestJob.id} for user ${userId} still running (age: ${Math.round(
            ageMs / 1000
          )}s). Blocking new sync.`
        );

        return new Response(
          JSON.stringify({
            error: "Sync already in progress",
            retryAfter: retryAfterSeconds,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Handle sync_jobs tracking
    if (providedJobId) {
      // Update existing job to 'running'
      const { error: updateJobError } = await supabaseAdmin
        .from('sync_jobs')
        .update({ 
          status: 'running',
          details: 'Gmail import started'
        })
        .eq('id', providedJobId)
        .eq('user_id', userId);

      if (updateJobError) {
        throw new Error(`Failed to update sync job: ${updateJobError.message}`);
      }

      jobId = providedJobId;
      console.log(`🔄 Using existing sync job ${jobId}`);
    } else {
      // Create new sync job
      const { data: newJob, error: createJobError } = await supabaseAdmin
        .from('sync_jobs')
        .insert({
          user_id: userId,
          status: 'running',
          details: 'Gmail import started (type: gmail_import)'
        })
        .select()
        .single();

      if (createJobError || !newJob) {
        throw new Error(`Failed to create sync job: ${createJobError?.message || 'Unknown error'}`);
      }

      jobId = newJob.id;
      console.log(`✨ Created new sync job ${jobId}`);
    }

    console.log(`🚀 Starting thread ingestion for user: ${userId}, job: ${jobId}`);

    // Get user profile to check last sync time
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('threads_last_synced_at')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    const profileLastSyncedAt = profileData?.threads_last_synced_at;

    // Determine sync time window with strict 90-day limit
    // Calculate 90 days ago as the maximum lookback period
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);

    let lastSyncTime: Date;

    if (profileLastSyncedAt) {
      const lastSyncDate = new Date(profileLastSyncedAt);
      
      // Check if last sync is older than 90 days
      if (lastSyncDate < ninetyDaysAgo) {
        // Last sync is too old, use 90-day limit instead
        lastSyncTime = new Date(ninetyDaysAgo);
        console.log(`📅 Last sync time (${lastSyncDate.toISOString()}) is older than 90 days. Using 90-day limit: ${lastSyncTime.toISOString()}`);
      } else {
        // Last sync is recent (within 90 days), use it
        lastSyncTime = new Date(lastSyncDate);
        console.log(`📅 Using recent last sync time (UTC): ${lastSyncTime.toISOString()}`);
      }
    } else {
      // No sync history exists, default to 90 days ago
      lastSyncTime = new Date(ninetyDaysAgo);
      console.log(`📅 No previous sync found. Starting from 90 days ago (UTC): ${lastSyncTime.toISOString()}`);
    }

    // Apply 1-day safety buffer to ensure we catch threads that were updated
    // right at the boundary (Gmail's after: query is inclusive)
    lastSyncTime = new Date(lastSyncTime.getTime() - (24 * 60 * 60 * 1000)); // Subtract 1 day
    console.log(`📅 Final sync time with 1-day buffer (UTC): ${lastSyncTime.toISOString()}. Querying threads modified after this date.`);

    // Build Gmail API query
    // Gmail API expects Unix timestamp in seconds
    const unixTimestamp = Math.floor(lastSyncTime.getTime() / 1000);
    const baseQuery = `after:${unixTimestamp}`;

    // Fetch threads from Gmail API (with pagination support)
    let threadIds: string[] = [];
    let nextPageToken: string | undefined;
    let totalThreadsFetched = 0;

    do {
      let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(baseQuery)}&maxResults=500`;
      
      if (nextPageToken) {
        listUrl += `&pageToken=${nextPageToken}`;
      }

      const listResp = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${providerToken}` }
      });

      if (!listResp.ok) {
        const errorText = await listResp.text();
        throw new Error(`Gmail API list request failed: ${errorText}`);
      }

      const listJson = await listResp.json();
      const threadsArray = Array.isArray(listJson.threads) ? listJson.threads as { id?: string }[] : [];
      const pageThreadIds = threadsArray
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id));

      threadIds.push(...pageThreadIds);
      totalThreadsFetched += pageThreadIds.length;
      nextPageToken = listJson.nextPageToken;

      console.log(`📧 Fetched ${pageThreadIds.length} threads (total: ${totalThreadsFetched})`);
    } while (nextPageToken);

    console.log(`📧 Total threads discovered from Gmail: ${threadIds.length}`);

    // Determine which threads to process in this run (oldest first, up to MAX_THREADS_PER_RUN)
    let hasMore = false;
    let threadsToProcess: string[] = [];

    if (threadIds.length > 0) {
      // Oldest first
      threadIds.reverse();
      hasMore = threadIds.length > MAX_THREADS_PER_RUN;
      threadsToProcess = hasMore
        ? threadIds.slice(0, MAX_THREADS_PER_RUN)
        : threadIds.slice();

      console.log(
        `📧 Limiting processing to ${threadsToProcess.length} threads this run (hasMore=${hasMore})`
      );
    } else {
      console.log("📭 No threads returned from Gmail; nothing to process in this run.");
    }

    // Process threads in parallel batches
    const BATCH_SIZE = 10;
    let threadsSynced = 0;
    let messagesSynced = 0;
    const errors: string[] = [];
    let batchLastMessageTime: number | null = null;

    // Process thread function (extracted for reuse in batch processing)
    const processThread = async (threadId: string): Promise<{ success: boolean; messagesCount: number; errors: string[]; lastMessageDate?: string }> => {
      const threadErrors: string[] = [];
      const messagesCount = 0;

      try {
        console.log(`🧵 Processing thread: ${threadId}`);

        // Fetch full thread details from Gmail API
        const threadResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
          {
            headers: { Authorization: `Bearer ${providerToken}` }
          }
        );

        if (!threadResp.ok) {
          const errorText = await threadResp.text();
          console.warn(`⚠️ Failed to fetch thread ${threadId}: ${errorText}`);
          threadErrors.push(`Thread ${threadId}: ${errorText}`);
          return { success: false, messagesCount: 0, errors: threadErrors };
        }

        type GmailThreadJson = {
          messages?: { internalDate?: string }[];
          [key: string]: unknown;
        };

        const threadJson = await threadResp.json() as GmailThreadJson;

        // Compute last message date for this thread (based on internalDate of last message)
        let lastMessageDate: string | undefined;
        const messagesForThread = Array.isArray(threadJson.messages)
          ? threadJson.messages
          : [];
        if (messagesForThread.length > 0) {
          const lastMessage = messagesForThread[messagesForThread.length - 1];
          if (lastMessage.internalDate) {
            const ms = Number(lastMessage.internalDate);
            if (!Number.isNaN(ms)) {
              lastMessageDate = new Date(ms).toISOString();
            }
          }
        }

        // Upsert thread data as a dumb pipe: store raw JSON and leave parsing to downstream processors
        const { error: threadError } = await supabaseAdmin
          .from('threads')
          .upsert({
            thread_id: threadId,
            user_id: userId,
            raw_thread_data: threadJson,
            body: null
          }, {
            onConflict: 'thread_id'
          });

        if (threadError) {
          throw new Error(`Failed to upsert thread: ${threadError.message}`);
        }

        // Upsert thread processing stage
        // Check if record exists first, then update or insert
        const { data: existingStage } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('id')
          .eq('thread_id', threadId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existingStage) {
          // Update existing record
          const { error: stageError } = await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: 'imported',
              stage_imported: true,
              imported_at: new Date().toISOString(),
              sync_job_id: jobId || null
            })
            .eq('id', existingStage.id);
          
          if (stageError) {
            console.warn(`⚠️ Failed to update thread_processing_stages for ${threadId}: ${stageError.message}`);
          }
        } else {
          // Insert new record
          const { error: stageError } = await supabaseAdmin
            .from('thread_processing_stages')
            .insert({
              thread_id: threadId,
              user_id: userId,
              sync_job_id: jobId || null,
              current_stage: 'imported',
              stage_imported: true,
              imported_at: new Date().toISOString()
            });
          
          if (stageError) {
            console.warn(`⚠️ Failed to insert thread_processing_stages for ${threadId}: ${stageError.message}`);
          }
        }

        console.log(`✅ Successfully processed thread ${threadId} (raw JSON stored, parsing deferred)`);
        return { success: true, messagesCount, errors: threadErrors, lastMessageDate };

      } catch (threadError) {
        console.error(`❌ Error processing thread ${threadId}:`, threadError);
        threadErrors.push(`Thread ${threadId}: ${threadError instanceof Error ? threadError.message : String(threadError)}`);
        return { success: false, messagesCount: 0, errors: threadErrors };
      }
    };

    // Process threads in batches
    for (let i = 0; i < threadsToProcess.length; i += BATCH_SIZE) {
      const batch = threadsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} threads)`);

      // Create promises for all threads in the batch
      const promises = batch.map(threadId => processThread(threadId));

      // Process batch in parallel
      const results = await Promise.all(promises);

      // Update counters and collect errors from batch results
      for (const result of results) {
        if (result.success) {
          threadsSynced++;

          if (result.lastMessageDate) {
            const t = Date.parse(result.lastMessageDate);
            if (!Number.isNaN(t)) {
              if (batchLastMessageTime === null || t > batchLastMessageTime) {
                batchLastMessageTime = t;
              }
            }
          }
        }
        messagesSynced += result.messagesCount;
        errors.push(...result.errors);
      }

      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} completed. Progress: ${Math.min(i + BATCH_SIZE, threadsToProcess.length)}/${threadsToProcess.length} threads in this run`);
    }

    // Update last sync timestamp based on the last successfully processed message in this batch
    if (batchLastMessageTime !== null) {
      const nextCursorDate = new Date(batchLastMessageTime + 1000); // +1 second
      const cursorIso = nextCursorDate.toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ threads_last_synced_at: cursorIso })
        .eq('id', userId);

      if (updateError) {
        console.warn(`⚠️ Failed to update threads_last_synced_at: ${updateError.message}`);
        // Don't fail the whole operation, just log the warning
      } else {
        console.log(`✅ Updated threads_last_synced_at cursor to ${cursorIso} based on processed batch`);
      }
    } else {
      console.log("ℹ️ No threads were successfully processed in this run; not updating threads_last_synced_at cursor.");
    }

    // Update sync job to completed with summary
    if (jobId) {
      const summaryDetails = JSON.stringify({
        threads: threadsSynced,
        messages: messagesSynced,
        total_threads_fetched: threadIds.length,
        errors_count: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit to first 10 errors
      });

      const { error: jobUpdateError } = await supabaseAdmin
        .from('sync_jobs')
        .update({
          status: 'completed',
          details: summaryDetails
        })
        .eq('id', jobId);

      if (jobUpdateError) {
        console.warn(`⚠️ Failed to update sync job to completed: ${jobUpdateError.message}`);
      } else {
        console.log(`✅ Updated sync job ${jobId} to completed`);
      }
    }

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      jobId: jobId,
      threads_synced: threadsSynced,
      messages_synced: messagesSynced,
      total_threads_fetched: threadIds.length,
      hasMore,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Error in ingest-threads:', error);
    
    // Update sync job to failed if we have a jobId
    if (jobId) {
      try {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await supabaseAdmin
          .from('sync_jobs')
          .update({
            status: 'failed',
            details: `Gmail import failed: ${errorMessage}`
          })
          .eq('id', jobId);
        
        console.log(`✅ Updated sync job ${jobId} to failed`);
      } catch (updateError) {
        console.error(`❌ Failed to update sync job to failed:`, updateError);
        // Don't throw - we're already in error handling
      }
    }
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      jobId: jobId || undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

