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
  // #region agent log
  const logData = {method:req.method,url:req.url,headers:Object.fromEntries(req.headers.entries()),timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'};
  try {
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads/index.ts:16',message:'Edge function request received',data:logData})}).catch(()=>{});
  } catch {}
  // #endregion

  if (req.method === 'OPTIONS') {
    // #region agent log
    try {
      await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads/index.ts:20',message:'Handling OPTIONS preflight',data:{corsHeaders},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    } catch {}
    // #endregion
    return new Response('ok', { headers: corsHeaders });
  }

  // #region agent log
  try {
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads/index.ts:25',message:'Returning 410 Gone response',data:{status:410,hasCorsHeaders:true,corsHeaders},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  } catch {}
  // #endregion

  // ⚠️ DISABLED: This function has been disabled in favor of the new fetch-gmail-batch + Trigger.dev implementation
  return new Response(
    JSON.stringify({ 
      error: "ingest-threads function is disabled. Please use the new fetch-gmail-batch function with Trigger.dev ingest-threads task instead." 
    }),
    {
      status: 410, // 410 Gone - indicates the resource is no longer available
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );

  // Original implementation below (disabled):
  /*
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

    const profileLastSyncedAt = profileData?.threads_last_synced_at as string | null;

    // Build Gmail API query based on cursor
    // If we have a previous cursor, use it to build an `after:` query.
    // If not, leave q empty for full backfill.
    let gmailQuery = "";
    if (profileLastSyncedAt) {
      const cursorDate = new Date(profileLastSyncedAt);
      const ms = cursorDate.getTime();
      if (!Number.isNaN(ms)) {
        const unixSeconds = Math.floor(ms / 1000);
        gmailQuery = `after:${unixSeconds}`;
        console.log(
          `📅 Using threads_last_synced_at cursor from profile: ${profileLastSyncedAt} (q="${gmailQuery}")`
        );
      } else {
        console.warn(
          `⚠️ Invalid threads_last_synced_at value "${profileLastSyncedAt}", falling back to full backfill (empty query)`
        );
      }
    } else {
      console.log(
        "📅 No previous threads_last_synced_at found. Running in backfill mode with empty Gmail query."
      );
    }

    // Fetch threads from Gmail API (with pagination support)
    let threadIds: string[] = [];
    let nextPageToken: string | undefined;
    let totalThreadsFetched = 0;

    do {
      const queryParam = gmailQuery
        ? `q=${encodeURIComponent(gmailQuery)}&`
        : "";
      let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?${queryParam}maxResults=500`;
      
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

    // If there are no threads at all, we can return early
    if (threadIds.length === 0) {
      console.log("📭 No threads returned from Gmail; nothing to process in this run.");

      // Still update sync job as completed
      if (jobId) {
        const summaryDetails = JSON.stringify({
          threads: 0,
          messages: 0,
          total_threads_fetched: 0,
          errors_count: 0,
        });

        const { error: jobUpdateError } = await supabaseAdmin
          .from("sync_jobs")
          .update({
            status: "completed",
            details: summaryDetails,
          })
          .eq("id", jobId);

        if (jobUpdateError) {
          console.warn(
            `⚠️ Failed to update sync job to completed when no threads: ${jobUpdateError.message}`,
          );
        } else {
          console.log(`✅ Updated sync job ${jobId} to completed (no threads)`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          jobId,
          threads_synced: 0,
          messages_synced: 0,
          total_threads_fetched: 0,
          hasMore: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Process threads in parallel batches
    const BATCH_SIZE = 10;
    let threadsSynced = 0;
    let messagesSynced = 0;
    const errors: string[] = [];

    // Smart filter: load existing threads to classify new/reply/duplicate
    type ExistingThreadRow = {
      thread_id: string;
      last_message_date: string | null;
    };

    const existingById = new Map<string, number | null>();
    if (threadsToProcess.length > 0) {
      const { data: existingThreads, error: existingThreadsError } =
        await supabaseAdmin
          .from("threads")
          .select("thread_id, last_message_date")
          .eq("user_id", userId)
          .in("thread_id", threadsToProcess);

      if (existingThreadsError) {
        throw new Error(
          `Failed to fetch existing threads for smart filter: ${existingThreadsError.message}`,
        );
      }

      for (const row of (existingThreads || []) as ExistingThreadRow[]) {
        if (!row.thread_id) continue;
        const iso = row.last_message_date;
        if (!iso) {
          existingById.set(row.thread_id, null);
          continue;
        }
        const ms = Date.parse(iso);
        existingById.set(row.thread_id, Number.isNaN(ms) ? null : ms);
      }

      console.log(
        `🧠 Smart filter: loaded ${existingById.size} existing thread records for classification`,
      );
    }

    // Process thread function (extracted for reuse in batch processing)
    const processThread = async (
      threadId: string,
      existingLastMessageMs: number | null,
    ): Promise<{
      success: boolean;
      messagesCount: number;
      errors: string[];
      lastMessageDateMs?: number | null;
    }> => {
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
        
        // Compute last message timestamp for this thread based on Gmail internalDate
        let lastMessageMs: number | null = null;
        const messagesForThread = Array.isArray(threadJson.messages)
          ? threadJson.messages
          : [];
        for (const msg of messagesForThread) {
          if (!msg.internalDate) continue;
          const ms = Number(msg.internalDate);
          if (!Number.isNaN(ms)) {
            if (lastMessageMs === null || ms > lastMessageMs) {
              lastMessageMs = ms;
            }
          }
        }

        // Smart filter classification: new vs reply vs duplicate
        const hasExisting = existingLastMessageMs !== undefined;
        const existingMs =
          existingLastMessageMs === undefined ? null : existingLastMessageMs;

        if (hasExisting && existingMs !== null && lastMessageMs !== null) {
          if (lastMessageMs <= existingMs) {
            console.log(
              `🗑️ Skipping duplicate thread ${threadId} (gmailMs=${lastMessageMs}, dbMs=${existingMs})`,
            );
            return {
              success: false,
              messagesCount: 0,
              errors: threadErrors,
              lastMessageDateMs: lastMessageMs,
            };
          }
          console.log(
            `📝 Detected reply/update for thread ${threadId} (gmailMs=${lastMessageMs}, dbMs=${existingMs})`,
          );
        } else if (hasExisting) {
          console.log(
            `📝 Treating thread ${threadId} as update with missing timestamps (gmailMs=${lastMessageMs}, dbMs=${existingMs})`,
          );
        } else {
          console.log(
            `🆕 Detected new thread ${threadId} (gmailMs=${lastMessageMs})`,
          );
        }
        
        // Upsert thread data as a dumb pipe: store raw JSON and leave parsing to downstream processors
        const lastMessageIso =
          lastMessageMs !== null ? new Date(lastMessageMs).toISOString() : null;

        const { error: threadError } = await supabaseAdmin
          .from('threads')
          .upsert({
            thread_id: threadId,
            user_id: userId,
            raw_thread_data: threadJson,
            body: null,
            last_message_date: lastMessageIso
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
        return {
          success: true,
          messagesCount,
          errors: threadErrors,
          lastMessageDateMs: lastMessageMs,
        };

      } catch (threadError) {
        console.error(`❌ Error processing thread ${threadId}:`, threadError);
        threadErrors.push(`Thread ${threadId}: ${threadError instanceof Error ? threadError.message : String(threadError)}`);
        return {
          success: false,
          messagesCount: 0,
          errors: threadErrors,
          lastMessageDateMs: undefined,
        };
      }
    };

    // Process threads in batches
    for (let i = 0; i < threadsToProcess.length; i += BATCH_SIZE) {
      const batch = threadsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} threads)`);

      // Create promises for all threads in the batch (with smart filter context)
      const promises = batch.map((threadId) =>
        processThread(
          threadId,
          existingById.has(threadId) ? existingById.get(threadId) ?? null : undefined,
        )
      );

      // Process batch in parallel
      const results = await Promise.all(promises);

      // Update counters and collect errors from batch results
      for (const result of results) {
        if (result.success) {
          threadsSynced++;
        }
        messagesSynced += result.messagesCount;
        errors.push(...result.errors);
      }

      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} completed. Progress: ${Math.min(i + BATCH_SIZE, threadsToProcess.length)}/${threadsToProcess.length} threads in this run`);
    }

    // Update cursor based on the newest thread in the fetched batch,
    // even if that thread was classified as a duplicate and skipped.
    let cursorIso: string | null = null;
    const newestThreadId =
      threadIds.length > 0 ? threadIds[threadIds.length - 1] : null;

    if (newestThreadId) {
      try {
        const cursorResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${newestThreadId}?format=metadata`,
          {
            headers: { Authorization: `Bearer ${providerToken}` },
          },
        );

        if (!cursorResp.ok) {
          const errorText = await cursorResp.text();
          console.warn(
            `⚠️ Failed to fetch newest thread ${newestThreadId} for cursor: ${errorText}`,
          );
        } else {
          const cursorJson = await cursorResp.json() as {
            messages?: { internalDate?: string }[];
          };
          let maxMs: number | null = null;
          const msgs = Array.isArray(cursorJson.messages)
            ? cursorJson.messages
            : [];
          for (const msg of msgs) {
            if (!msg.internalDate) continue;
            const ms = Number(msg.internalDate);
            if (!Number.isNaN(ms)) {
              if (maxMs === null || ms > maxMs) {
                maxMs = ms;
              }
            }
          }

          if (maxMs !== null) {
            cursorIso = new Date(maxMs).toISOString();
          }
        }
      } catch (cursorError) {
        console.warn(
          `⚠️ Error while determining cursor from newest thread ${newestThreadId}:`,
          cursorError,
        );
      }
    }

    if (cursorIso) {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ threads_last_synced_at: cursorIso })
        .eq("id", userId);

      if (updateError) {
        console.warn(
          `⚠️ Failed to update threads_last_synced_at: ${updateError.message}`,
        );
      } else {
        console.log(
          `✅ Updated threads_last_synced_at cursor to ${cursorIso} based on newest fetched thread ${newestThreadId}`,
        );
      }
    } else {
      console.log(
        "ℹ️ Could not determine a valid cursor from newest fetched thread; leaving threads_last_synced_at unchanged.",
      );
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
  */
});

