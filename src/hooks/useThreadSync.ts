'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { SyncStatus } from '@/lib/types/threads';

interface UseThreadSyncReturn {
  syncStatus: SyncStatus;
  syncDetails: string;
  jobId: number | null;
  progressPercentage: number | null; // 0-100 or null if not available
  startSync: () => Promise<void>;
}

export function useThreadSync(provider_token: string | null | undefined, user_email: string | null | undefined): UseThreadSyncReturn {
  const [jobId, setJobId] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncDetails, setSyncDetails] = useState<string>('');
  const [progressPercentage, setProgressPercentage] = useState<number | null>(null);
  const supabase = useSupabase();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const startSync = useCallback(async () => {
    // Get the latest session to check for provider_token
    const { data: { session } } = await supabase.auth.getSession();
    
    // Use provider_token from session if available, otherwise use prop
    const currentProviderToken = session?.provider_token || provider_token;
    const currentUserEmail = session?.user?.email || user_email;
    
    if (!currentProviderToken || !currentUserEmail) {
      setSyncStatus('failed');
      setSyncDetails('Missing provider token or user email');
      console.error('Missing provider token or user email', {
        hasProviderToken: !!currentProviderToken,
        hasUserEmail: !!currentUserEmail,
        sessionHasProviderToken: !!session?.provider_token,
        sessionHasUser: !!session?.user
      });
      return;
    }

    try {
      setSyncStatus('creating_job');
      setSyncDetails('Creating sync job...');

      // Use the session we already fetched, or get it again
      const currentSession = session || (await supabase.auth.getSession()).data.session;
      if (!currentSession?.user?.id) {
        throw new Error('No authenticated user found');
      }
      
      // Use the provider_token from session (it's more up-to-date)
      const tokenToUse = currentSession.provider_token || currentProviderToken;
      if (!tokenToUse) {
        throw new Error('Provider token not available in session');
      }

      setSyncDetails('Creating sync job and starting sync...');

      // Invoke sync-threads-orchestrator function (creates job and initial page queue)
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-threads-orchestrator', {
        body: { 
          provider_token: tokenToUse,
          userId: currentSession.user.id
        }
      });

      if (invokeError) {
        throw new Error(`Failed to invoke orchestrator: ${invokeError.message}`);
      }

      // Extract jobId from response
      const newJobId = invokeData?.jobId;
      if (!newJobId) {
        throw new Error('Orchestrator did not return jobId');
      }

      setJobId(newJobId);
      setSyncStatus('syncing');
      setSyncDetails('Sync started successfully');
    } catch (error) {
      console.error('Error starting sync:', error);
      setSyncStatus('failed');
      setSyncDetails(error instanceof Error ? error.message : 'Failed to start sync');
    }
  }, [provider_token, user_email, supabase]);

  // Polling logic
  useEffect(() => {
    if (syncStatus !== 'syncing' || !jobId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const checkJobStatus = async () => {
      try {
        const { data: job, error } = await supabase
          .from('sync_jobs')
          .select('status, details, total_pages, pages_completed')
          .eq('id', jobId)
          .single();

        if (error) {
          console.error('Error checking job status:', error);
          // If error is about missing columns, log it specifically
          if (error.message?.includes('total_pages') || error.message?.includes('pages_completed')) {
            console.error('⚠️ Migration not applied: total_pages and pages_completed columns are missing. Please apply the migration to the database.');
          }
          return;
        }

        if (!job) {
          return;
        }

        const status = job.status as string;

        // Calculate progress percentage
        if (job.total_pages !== null && job.total_pages !== undefined && job.pages_completed !== null && job.pages_completed !== undefined) {
          const percentage = Math.min(100, Math.round((job.pages_completed / job.total_pages) * 100));
          setProgressPercentage(percentage);
          console.log(`📊 Progress: ${job.pages_completed}/${job.total_pages} pages (${percentage}%)`);
        } else {
          // If we don't have total_pages yet, set to 0 (show empty bar) instead of null
          // This ensures the progress bar is visible even at the start
          setProgressPercentage(0);
          console.log('📊 Progress: Waiting for first page to estimate total pages...');
        }

        if (status === 'completed') {
          setSyncStatus('completed');
          setSyncDetails(job.details || 'Sync completed successfully');
          // Set progress to 100% on completion
          setProgressPercentage(100);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status === 'failed') {
          setSyncStatus('failed');
          setSyncDetails(job.details || 'Sync failed');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status === 'running' || status === 'pending') {
          setSyncDetails(job.details || `Sync ${status}...`);
          // Continue polling
        }
      } catch (error) {
        console.error('Error in checkJobStatus:', error);
      }
    };

    // Poll every 3 seconds
    pollingIntervalRef.current = setInterval(checkJobStatus, 3000);
    
    // Also check immediately
    checkJobStatus();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [syncStatus, jobId, supabase]);

  return {
    syncStatus,
    syncDetails,
    jobId,
    progressPercentage,
    startSync
  };
}

