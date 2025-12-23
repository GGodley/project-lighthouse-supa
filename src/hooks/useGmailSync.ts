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

      // Trigger Gmail sync via Server Action (reads token from secure cookie)
      const result = await startGmailSync();

      if (result.success) {
        console.log('✅ Gmail sync job triggered successfully', {
          handle: result.handle,
        });
        // Use handle.id for tracking (Trigger.dev manages the queue)
        setJobId(result.handle?.id || null);
        setError(null);
      } else {
        // Handle session expired or other errors
        if (result.error === 'Session expired. Please log in again.' || result.redirectToLogin) {
          setError('Session expired. Redirecting to login...');
          // Redirect to login page
          window.location.href = '/login?error=Session expired. Please log in again.';
          return;
        } else {
          setError(result.error || 'Gmail sync job failed to start');
        }
        setJobId(null);
      }
    } catch (err) {
      console.error('❌ Error triggering Gmail sync:', err);
      
      // Handle NEXT_REDIRECT error (shouldn't happen now, but just in case)
      if (err && typeof err === 'object' && 'digest' in err && String(err.digest).includes('NEXT_REDIRECT')) {
        // Next.js redirect was called - let it handle the redirect
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during sync';
      
      // Show error toast for unauthorized errors
      if (errorMessage.includes('Unauthorized')) {
        setError('Please log in to sync your Gmail.');
        window.location.href = '/login?error=Please log in to sync your Gmail.';
        return;
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

