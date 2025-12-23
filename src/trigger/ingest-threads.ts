import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { analyzeThreadTask } from "./analyzer";

/**
 * Ingest Threads Job - Orchestrates Gmail sync with pagination
 * 
 * Role: Fetches Gmail threads from Supabase Edge Function in a pagination loop,
 * saves them to the database, and triggers analysis for each batch.
 * 
 * Flow:
 * 1. Claim atomic lock (exit if already processing)
 * 2. Fetch threads from Edge Function in pagination loop
 * 3. For each batch: Upsert threads -> Trigger analysis immediately
 * 4. Continue until no more pages
 * 5. Release lock on completion or error
 */
export const ingestThreadsTask = task({
  id: "ingest-threads",
  run: async (payload: { userId: string }) => {
    const { userId } = payload;

    console.log(`🔄 Starting ingest-threads job for user: ${userId}`);

    // Initialize Supabase client with service role key
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );

    try {
      // Step 1: Atomic Lock
      const { data: lockAcquired, error: lockError } = await supabaseAdmin.rpc(
        "claim_sync_lock",
        { p_user_id: userId }
      );

      if (lockError) {
        throw new Error(`Failed to claim sync lock: ${lockError.message}`);
      }

      if (!lockAcquired) {
        console.log(
          `⏸️  Processing already in progress for user ${userId}. Exiting.`
        );
        return;
      }

      console.log(`✅ Lock acquired for user ${userId}`);

      // Step 2: Fetch threads from Edge Function in pagination loop
      let pageToken: string | null = null;
      let totalThreadsFetched = 0;
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-gmail-batch`;

      while (true) {
        console.log(
          `🔄 Fetching Gmail threads batch (total fetched: ${totalThreadsFetched}, pageToken: ${pageToken || 'none'})`
        );

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads.ts:79',message:'About to call fetch-gmail-batch edge function',data:{userId,pageToken,edgeFunctionUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        // Fetch batch from Edge Function
        const fetchResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ userId, pageToken }),
        });

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads.ts:94',message:'Edge function response received',data:{status:fetchResponse.status,ok:fetchResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error(
            `❌ Edge Function fetch failed: ${fetchResponse.status} - ${errorText}`
          );
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads.ts:102',message:'Edge function error details',data:{status:fetchResponse.status,errorText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          throw new Error(
            `Failed to fetch Gmail threads: ${fetchResponse.status} - ${errorText}`
          );
        }

        const responseData: {
          threads: Array<{ id: string; [key: string]: unknown }>;
          nextPageToken: string | null;
        } = await fetchResponse.json();

        const threads = responseData.threads || [];
        const nextPageToken = responseData.nextPageToken || null;

        console.log(
          `📧 Fetched ${threads.length} threads from Gmail API (hasNextPage: ${!!nextPageToken})`
        );

        // Handle fetched threads: Upsert and trigger analysis
        if (threads.length > 0) {
          // Prepare threads for upsert - store entire thread object in raw_thread_data
          const threadsToUpsert = threads.map((thread) => ({
            thread_id: thread.id,
            user_id: userId,
            raw_thread_data: thread, // Store entire thread object as JSONB
          }));

          // Upsert threads into database
          const { error: upsertError } = await supabaseAdmin
            .from('threads')
            .upsert(threadsToUpsert, {
              onConflict: 'thread_id',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            throw new Error(
              `Failed to upsert threads: ${upsertError.message}`
            );
          }

          console.log(`✅ Upserted ${threads.length} threads to database`);

          // IMMEDIATELY trigger analyze-thread for this batch
          const threadIds = threads.map((t) => t.id);
          if (threadIds.length > 0) {
            console.log(
              `🚀 Dispatching ${threadIds.length} analysis jobs in parallel`
            );

            // Trigger all analysis jobs in parallel
            await Promise.all(
              threadIds.map((threadId: string) =>
                analyzeThreadTask.trigger({
                  userId,
                  threadId,
                })
              )
            );

            console.log(`✅ Dispatched ${threadIds.length} analysis jobs`);
          }

          totalThreadsFetched += threads.length;
        }

        // Pagination: Check if there's a next page
        if (nextPageToken) {
          pageToken = nextPageToken;
          // Continue loop to fetch next page
        } else {
          // No more pages, break the loop
          console.log('📭 No more pages to fetch');
          break;
        }
      }

      // Step 3: Cleanup - Release lock with idle status
      const { error: cleanupError } = await supabaseAdmin.rpc(
        "release_sync_lock",
        {
          p_user_id: userId,
          p_status: "idle",
          p_next_page_token: null,
          p_last_synced_at: new Date().toISOString(),
        }
      );

      if (cleanupError) {
        throw new Error(`Failed to release lock: ${cleanupError.message}`);
      }

      console.log(
        `✅ Ingest-threads job completed successfully for user ${userId} (fetched: ${totalThreadsFetched} threads)`
      );
    } catch (error) {
      console.error(
        `❌ Error in ingest-threads job for user ${userId}:`,
        error
      );

      // Error Handling: Release lock with failed status
      try {
        await supabaseAdmin.rpc("release_sync_lock", {
          p_user_id: userId,
          p_status: "failed",
          p_next_page_token: null,
          p_last_synced_at: null,
        });
        console.log(`🔓 Lock released with failed status for user ${userId}`);
      } catch (releaseError) {
        console.error(
          `⚠️  Failed to release lock on error: ${releaseError}`
        );
      }

      // Re-throw to mark job as failed
      throw error;
    }
  },
});

