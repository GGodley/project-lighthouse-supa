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
 * Hook for triggering Gmail sync via the ingest-threads edge function.
 * 
 * Handles:
 * - Session validation
 * - Provider token extraction
 * - Edge function invocation
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

      // Check for provider token (Google Access Token)
      const providerToken = session.provider_token;
      if (!providerToken) {
        throw new Error('Google access token not found. Please reconnect your Google account.');
      }

      // Get user ID
      const userId = session.user?.id;
      if (!userId) {
        throw new Error('User ID not found in session.');
      }

      console.log('🔄 Triggering Gmail sync via ingest-threads...', {
        userId,
        hasProviderToken: !!providerToken,
      });

      // Invoke the ingest-threads edge function
      const { data, error: invokeError } = await supabase.functions.invoke('ingest-threads', {
        body: {
          userId,
          providerToken,
        },
      });

      if (invokeError) {
        throw new Error(`Failed to invoke ingest-threads: ${invokeError.message}`);
      }

      // Extract jobId from response if available
      const returnedJobId = data?.jobId || data?.job_id || null;
      if (returnedJobId) {
        setJobId(returnedJobId);
        console.log('✅ Gmail sync started successfully. Job ID:', returnedJobId);
      } else {
        console.log('✅ Gmail sync started successfully (no job ID returned)');
      }

      // Clear any previous errors
      setError(null);
    } catch (err) {
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

