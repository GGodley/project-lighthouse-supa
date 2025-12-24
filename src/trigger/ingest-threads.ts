import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hydrateThreadTask } from "./hydrate-thread";

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
        const brokerSecret = process.env.BROKER_SHARED_SECRET;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!brokerSecret) {
          throw new Error('BROKER_SHARED_SECRET environment variable is not set');
        }

        if (!supabaseAnonKey) {
          throw new Error('SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set');
        }

        // Log broker secret being sent (safe - only first 6 chars)
        console.log("[BROKER] sending X-Broker-Secret header:", `${brokerSecret.slice(0, 6)}...`);

        const fetchResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'x-broker-secret': brokerSecret,
          },
          body: JSON.stringify({ userId, pageToken }),
        });

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ingest-threads.ts:94',message:'Edge function response received',data:{status:fetchResponse.status,ok:fetchResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: 'unknown' };
          }
          
          console.error(
            `❌ Edge Function fetch failed: ${fetchResponse.status} - [REDACTED]`
          );
          
          // Handle 403 separately (scope/permission issue, not token expiry)
          if (fetchResponse.status === 403 && errorData.error === 'gmail_forbidden') {
            await supabaseAdmin
              .from('sync_jobs')
              .update({
                status: 'failed',
                details: 'TOKEN_SCOPE_MISSING: Gmail permissions are missing. Please grant required scopes.',
                error: 'TOKEN_SCOPE_MISSING'
              })
              .eq('user_id', userId);
            
            await supabaseAdmin.rpc("release_sync_lock", {
              p_user_id: userId,
              p_status: "failed",
              p_next_page_token: null,
              p_last_synced_at: null,
            });
            
            throw new Error('TOKEN_SCOPE_MISSING');
          }
          
          // Check for token expiry (401 = Gmail auth failed, 412 = missing/expired token)
          if (fetchResponse.status === 401 && errorData.error === 'gmail_unauthorized') {
            // Token expired or invalid
            await supabaseAdmin
              .from('sync_jobs')
              .update({
                status: 'failed',
                details: 'TOKEN_EXPIRED_RECONNECT: Google token expired. Please reconnect your Google account.',
                error: 'TOKEN_EXPIRED_RECONNECT'
              })
              .eq('user_id', userId);
            
            await supabaseAdmin.rpc("release_sync_lock", {
              p_user_id: userId,
              p_status: "failed",
              p_next_page_token: null,
              p_last_synced_at: null,
            });
            
            throw new Error('TOKEN_EXPIRED_RECONNECT');
          }
          
          if (fetchResponse.status === 412 && 
              (errorData.error === 'missing_google_token' || errorData.error === 'token_expired')) {
            // Token not found in DB or expired
            await supabaseAdmin
              .from('sync_jobs')
              .update({
                status: 'failed',
                details: 'TOKEN_EXPIRED_RECONNECT: Google token not found or expired. Please reconnect your Google account.',
                error: 'TOKEN_EXPIRED_RECONNECT'
              })
              .eq('user_id', userId);
            
            await supabaseAdmin.rpc("release_sync_lock", {
              p_user_id: userId,
              p_status: "failed",
              p_next_page_token: null,
              p_last_synced_at: null,
            });
            
            throw new Error('TOKEN_EXPIRED_RECONNECT');
          }
          
          throw new Error(`Failed to fetch Gmail threads: ${fetchResponse.status} - [REDACTED]`);
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

        // CRITICAL: Write checkpoint (next_page_token) BEFORE upserting threads
        // This ensures crash recovery works correctly
        if (nextPageToken) {
          // Update sync_jobs with next_page_token immediately
          await supabaseAdmin
            .from('sync_jobs')
            .update({ 
              next_page_token: nextPageToken,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        }

        // NOW upsert threads (after checkpoint is saved)
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

          // IMMEDIATELY trigger hydrate-thread for this batch
          // Determine if this is initial sync (no pageToken means we're starting from the beginning)
          const isInitialSync = !pageToken;
          
          if (threads.length > 0) {
            console.log(
              `🚀 Dispatching ${threads.length} hydration jobs in parallel`
            );

            // Trigger all hydration jobs in parallel
            await Promise.all(
              threads.map((thread: { id: string; historyId?: string; history_id?: string }) => {
                const incomingHistoryId = thread.historyId ?? thread.history_id ?? "";
                return hydrateThreadTask.trigger({
                  userId,
                  threadId: thread.id,
                  incomingHistoryId,
                  reason: isInitialSync ? "initial_sync" : "incremental_sync",
                });
              })
            );

            console.log(`✅ Dispatched ${threads.length} hydration jobs`);
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

