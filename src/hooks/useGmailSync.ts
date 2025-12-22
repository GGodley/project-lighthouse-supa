'use client';

import { useState, useCallback } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';

interface UseGmailSyncReturn {
  triggerSync: () => Promise<void>;
  isSyncing: boolean;
  error: string | null;
  jobId: string | number | null;
}

/**
 * Hook for triggering Gmail sync via the fetch-gmail-batch edge function.
 * 
 * Handles:
 * - Session validation
 * - Edge function invocation (fetch-gmail-batch)
 * - Loading and error states
 * - Job ID tracking
 */
export function useGmailSync(): UseGmailSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | number | null>(null);
  const supabase = useSupabase();

  const triggerSync = useCallback(async () => {
    // Reset error state
    setError(null);
    setIsSyncing(true);

    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(`Failed to get session: ${sessionError.message}`);
      }

      if (!session) {
        throw new Error('No active session found. Please log in.');
      }

      // Get user ID
      const userId = session.user?.id;
      if (!userId) {
        throw new Error('User ID not found in session.');
      }

      console.log('🔄 Triggering Gmail sync via fetch-gmail-batch...', {
        userId,
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGmailSync.ts:45',message:'Before invoking fetch-gmail-batch edge function',data:{userId,functionName:'fetch-gmail-batch'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion

      // Invoke the fetch-gmail-batch edge function
      const { data, error: invokeError } = await supabase.functions.invoke('fetch-gmail-batch', {
        body: {
          userId,
          // Optional: pageToken and lastSyncedAt can be added later for pagination
        },
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGmailSync.ts:58',message:'After invoking fetch-gmail-batch',data:{hasData:!!data,hasError:!!invokeError,errorMessage:invokeError?.message,errorStatus:invokeError?.status,threadsCount:data?.threads?.length,hasNextPageToken:!!data?.nextPageToken},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion

      if (invokeError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGmailSync.ts:63',message:'Error from fetch-gmail-batch',data:{errorMessage:invokeError.message,errorStatus:invokeError.status,fullError:JSON.stringify(invokeError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        throw new Error(`Failed to invoke fetch-gmail-batch: ${invokeError.message}`);
      }

      // Extract jobId from response if available (fetch-gmail-batch doesn't return jobId, but we can track threads)
      const threadsCount = data?.threads?.length || 0;
      if (threadsCount > 0) {
        console.log(`✅ Gmail sync completed. Fetched ${threadsCount} threads`);
      } else {
        console.log('✅ Gmail sync completed (no new threads)');
      }

      // Clear any previous errors
      setError(null);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGmailSync.ts:78',message:'Caught error in triggerSync',data:{errorType:err?.constructor?.name,errorMessage:err instanceof Error ? err.message : String(err),errorName:err instanceof Error ? err.name : 'Unknown',stack:err instanceof Error ? err.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during sync';
      console.error('❌ Error triggering Gmail sync:', errorMessage, err);
      setError(errorMessage);
      setJobId(null);
    } finally {
      setIsSyncing(false);
    }
  }, [supabase]);

  return {
    triggerSync,
    isSyncing,
    error,
    jobId,
  };
}

