'use client';

import { useState, useCallback } from 'react';
import { SyncStatus } from '@/lib/types/threads';
import { startGmailSync } from '@/app/actions/sync';

interface UseThreadSyncReturn {
  syncStatus: SyncStatus;
  syncDetails: string;
  jobId: number | null;
  progressPercentage: number | null; // 0-100 or null if not available
  startSync: () => Promise<void>;
}

/**
 * Hook for triggering Gmail thread sync via Server Action → Trigger.dev.
 * 
 * Handles:
 * - Server Action invocation (triggers Trigger.dev job)
 * - Loading and error states
 * - Error toast display for unauthorized errors
 * 
 * Uses Cookie Backpack pattern - Server Action reads token from secure HTTP-only cookie.
 * Trigger.dev manages queue and job status - no database polling needed.
 */
export function useThreadSync(): UseThreadSyncReturn {
  const [jobId, setJobId] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncDetails, setSyncDetails] = useState<string>('');
  const [progressPercentage, setProgressPercentage] = useState<number | null>(null);

  const startSync = useCallback(async () => {
    try {
      setSyncStatus('creating_job');
      setSyncDetails('Creating sync job...');

      // Use Server Action to trigger Gmail sync (reads token from secure cookie)
      const result = await startGmailSync();

      if (result.success) {
        // Trigger.dev manages the queue - use handle.id for reference
        const triggerHandleId = result.handle?.id;
        setJobId(triggerHandleId ? Number(triggerHandleId) : null);
        setSyncStatus('syncing');
        setSyncDetails('Sync started successfully. Trigger.dev is processing in the background.');
        setProgressPercentage(null); // Trigger.dev manages progress
      } else {
        // Handle session expired or other errors
        if (result.error === 'Session expired') {
          setSyncDetails('Session expired. Please log in again.');
        } else {
          setSyncDetails(result.error || 'Gmail sync job failed to start');
        }
        setSyncStatus('failed');
        setJobId(null);
        setProgressPercentage(null);
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start sync';
      
      // Show appropriate error message
      if (errorMessage.includes('Unauthorized')) {
        setSyncDetails('Please log in to sync your Gmail.');
      } else {
        setSyncDetails(errorMessage);
      }
      
      setSyncStatus('failed');
      setJobId(null);
      setProgressPercentage(null);
    }
  }, []);

  return {
    syncStatus,
    syncDetails,
    jobId,
    progressPercentage,
    startSync
  };
}

