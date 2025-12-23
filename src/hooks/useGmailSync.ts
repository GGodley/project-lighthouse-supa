'use client';

import { useState, useCallback } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { startGmailSync } from '@/app/actions/sync';

interface UseGmailSyncReturn {
  triggerSync: () => Promise<void>;
  isSyncing: boolean;
  error: string | null;
  jobId: string | number | null;
}

/**
 * Hook for triggering Gmail sync via Server Action → Trigger.dev.
 * 
 * Handles:
 * - Session validation
 * - Server Action invocation (triggers Trigger.dev job)
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

      console.log('🔄 Triggering Gmail sync via Server Action...', {
        userId,
      });

      // Trigger Gmail sync via Server Action (which triggers Trigger.dev job)
      const result = await startGmailSync(userId);

      if (result.success) {
        console.log('✅ Gmail sync job triggered successfully', {
          handle: result.handle,
        });
        setJobId(result.handle?.id || null);
      } else {
        throw new Error('Gmail sync job failed to start');
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

