'use client';

import { useState, useCallback } from 'react';
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
 * - Server Action invocation (triggers Trigger.dev job)
 * - Loading and error states
 * - Error toast display for unauthorized errors
 * 
 * Server Action handles authentication automatically using session cookies.
 */
export function useGmailSync(): UseGmailSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | number | null>(null);

  const triggerSync = useCallback(async () => {
    // Reset error state
    setError(null);
    setIsSyncing(true);

    try {
      console.log('🔄 Triggering Gmail sync via Server Action...');

      // Trigger Gmail sync via Server Action
      // Server Action handles authentication internally using modern Supabase SSR pattern
      const result = await startGmailSync();

      if (result.success) {
        console.log('✅ Gmail sync job triggered successfully', {
          handle: result.handle,
        });
        // Use handle.id for tracking (Trigger.dev manages the queue)
        setJobId(result.handle?.id || null);
        setError(null);
      } else {
        throw new Error('Gmail sync job failed to start');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during sync';
      console.error('❌ Error triggering Gmail sync:', errorMessage, err);
      
      // Show error toast for unauthorized errors
      if (errorMessage.includes('Unauthorized')) {
        setError('Please log in to sync your Gmail.');
      } else {
        setError(errorMessage);
      }
      
      setJobId(null);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    triggerSync,
    isSyncing,
    error,
    jobId,
  };
}

