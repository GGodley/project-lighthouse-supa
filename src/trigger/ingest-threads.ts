import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { analyzeThreadTask } from "./analyzer";

/**
 * Ingest Threads Job - Orchestrator for Gmail Thread Synchronization
 * 
 * Role: The Orchestrator. Manages the sync loop but delegates fetching to Supabase Edge Function.
 * Uses Secure Relay pattern - no Google auth handling in this job.
 * 
 * Flow:
 * 1. Claim atomic lock (exit if already syncing)
 * 2. Initialize state from database
 * 3. Loop: Fetch via Edge Function -> Upsert -> Fan-out analysis -> Checkpoint
 * 4. Release lock on completion or error
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
          `⏸️  Sync already in progress for user ${userId}. Exiting.`
        );
        return;
      }

      console.log(`✅ Lock acquired for user ${userId}`);

      // Step 2: Initialize State
      const { data: userState, error: stateError } = await supabaseAdmin
        .from("user_sync_states")
        .select("next_page_token, last_synced_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (stateError) {
        throw new Error(`Failed to fetch user state: ${stateError.message}`);
      }

      let pageToken: string | null = userState?.next_page_token || null;
      const lastSyncedAt: string | null = userState?.last_synced_at || null;

      console.log(`📊 Initial state - pageToken: ${pageToken ? "exists" : "null"}, lastSyncedAt: ${lastSyncedAt || "null"}`);

      // Step 3: The Fetch Loop
      while (true) {
        console.log(`🔄 Fetching batch (pageToken: ${pageToken || "initial"})`);

        // Secure Fetch: Delegate to Supabase Edge Function
        const { data: fetchData, error: fetchError } = await supabaseAdmin.functions.invoke(
          "fetch-gmail-batch",
          {
            body: {
              userId,
              pageToken,
              lastSyncedAt,
            },
          }
        );

        // Error Handling: If fetch fails (e.g., token expired), mark as failed and exit
        if (fetchError) {
          console.error(
            `❌ Failed to fetch Gmail batch: ${fetchError.message}`
          );
          
          // Release lock with failed status
          await supabaseAdmin.rpc("release_sync_lock", {
            p_user_id: userId,
            p_status: "failed",
            p_next_page_token: null,
            p_last_synced_at: null,
          });

          throw new Error(
            `Gmail fetch failed: ${fetchError.message}. Sync marked as failed.`
          );
        }

        if (!fetchData) {
          throw new Error("fetch-gmail-batch returned no data");
        }

        const threads = fetchData.threads || [];
        const nextPageToken = fetchData.nextPageToken || null;

        console.log(
          `📧 Fetched ${threads.length} threads (nextPageToken: ${nextPageToken ? "exists" : "null"})`
        );

        // If no threads in this batch, break the loop
        if (threads.length === 0) {
          console.log("📭 No threads in batch, ending sync");
          break;
        }

        // Smart Upsert: Call RPC to upsert threads
        const { data: upsertedThreadIds, error: upsertError } =
          await supabaseAdmin.rpc("upsert_threads_batch", {
            p_user_id: userId,
            p_threads: threads,
          });

        if (upsertError) {
          throw new Error(
            `Failed to upsert threads: ${upsertError.message}`
          );
        }

        const threadIds = upsertedThreadIds || [];
        console.log(
          `✅ Upserted ${threadIds.length} threads (${threads.length - threadIds.length} skipped)`
        );

        // Fan-Out: Batch trigger analyze-thread jobs
        if (threadIds.length > 0) {
          console.log(
            `🚀 Dispatching ${threadIds.length} analysis jobs in parallel`
          );

          // Trigger all analysis jobs in parallel using Promise.all
          // This dispatches all jobs efficiently without awaiting individual results
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

        // Checkpoint: Update state with next page token
        const { error: checkpointError } = await supabaseAdmin.rpc(
          "release_sync_lock",
          {
            p_user_id: userId,
            p_status: "syncing",
            p_next_page_token: nextPageToken,
            p_last_synced_at: null, // Don't update last_synced_at yet
          }
        );

        if (checkpointError) {
          throw new Error(
            `Failed to checkpoint: ${checkpointError.message}`
          );
        }

        // Update local pageToken for next iteration
        pageToken = nextPageToken;

        // Break if no next page token (we've reached the end)
        if (!nextPageToken) {
          console.log("🏁 Reached end of pagination, completing sync");
          break;
        }
      }

      // Step 4: Cleanup - Release lock with idle status
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

      console.log(`✅ Ingest-threads job completed successfully for user ${userId}`);
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

