'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from './SupabaseProvider';
import type { Database } from '@/types/database.types';

// Define the type for a sync job row for clarity
type SyncJob = Database['public']['Tables']['sync_jobs']['Row'];

export default function SyncEmailsButton() {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true); // Start with loading true to check initial state
  const supabase = useSupabase();

  // Function to check the latest job status
  const checkLatestJobStatus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    const { data: latestJob, error } = await supabase
      .from('sync_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Use maybeSingle() to handle null results

    if (error) {
      console.error('Error fetching latest job:', error);
      setMessage('Could not fetch sync status.');
      setIsLoading(false);
      return;
    }

    // NEW USER SCENARIO: If no job exists, this is a new user
    if (!latestJob) {
      console.log('New user detected - no previous sync jobs found.');
      setJob(null);
      setIsLoading(false);
      return;
    }
    
    setJob(latestJob);
    setIsLoading(false); // Finished initial check
  }, [supabase]);

  // Effect to check status on initial component mount
  useEffect(() => {
    checkLatestJobStatus();
  }, [checkLatestJobStatus]);

  // Polling effect - only runs if a job is actively running
  useEffect(() => {
    if (job?.status !== 'running') {
      return; // Stop polling if the job is not running
    }

    const interval = setInterval(async () => {
      await checkLatestJobStatus();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [job, checkLatestJobStatus]);

  // Function to start a new sync process (with detailed diagnostic logging)
  const startSync = async () => {
    console.log("--- Sync Process Initiated ---");
    setIsLoading(true);
    setMessage('Attempting to start sync...');

    // --- DIAGNOSTIC LOG 1: Get the current session state ---
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    console.log("Session object at time of request:", session);
    if (sessionError) {
      console.error("Error fetching session:", sessionError);
    }
    
    // This log is the key piece of evidence.
    if (!session || !session.user) {
      console.error("PROOF: startSync was called but no valid session was found. This confirms the race condition.");
      setMessage('Authentication session not ready. Please wait a moment and try again.');
      setIsLoading(false);
      return;
    }

    const providerToken = (session as { provider_token?: string })?.provider_token;
    if (!providerToken) {
      console.error("PROOF: Session exists but provider_token is missing. This indicates incomplete OAuth flow.");
      setMessage('Error: Missing Google provider token. Please re-authenticate with Google to grant email access.');
      setIsLoading(false);
      return;
    }

    try {
      console.log("Session is valid. Attempting to create sync job for user:", session.user.id);
      
      // Use the same supabase client from context
      const untypedSupabase = supabase;
      const { data: newJob, error: jobError } = await untypedSupabase
        .from('sync_jobs')
        .insert({ user_id: session.user.id, status: 'pending' })
        .select()
        .single();

      if (jobError) {
        // This will show the RLS error if it still occurs
        console.error("DATABASE ERROR creating sync job:", jobError);
        setMessage(`Failed to create sync job: ${jobError.message}`);
        setIsLoading(false);
        return;
      }
      
      console.log("Successfully created sync job and invoked function.", newJob);
      setJob(newJob);
      
      const { error: invokeError } = await supabase.functions.invoke('sync-emails', {
        body: { 
          jobId: newJob.id, 
          provider_token: providerToken 
        },
      });
      
      if (invokeError) {
        console.error("EDGE FUNCTION INVOCATION ERROR:", invokeError);
        setMessage(`Error starting sync function: ${invokeError.message}`);
        setIsLoading(false);
        await untypedSupabase.from('sync_jobs').update({ status: 'failed', details: invokeError.message }).eq('id', newJob.id);
        return;
      }
      
      setMessage('Sync has been initiated in the background. We will notify you when it is complete.');
      setIsLoading(false);
    } catch (e) {
      const error = e as Error;
      console.error("An unexpected error occurred in startSync:", error);
      setMessage(`An unexpected error occurred: ${error.message}`);
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'Loading Status...';
    if (job?.status === 'running' || job?.status === 'pending') return 'Sync in Progress...';
    return 'Sync My Emails';
  };
  
  const getStatusMessage = () => {
    if (isLoading) return 'Checking sync status...';
    if (!job) return 'Welcome! Press the button to sync your emails for the first time.';
    if (job.status === 'completed') return `Last sync completed successfully.`;
    if (job.status === 'failed') return `Last sync failed: ${job.details}`;
    if (job.status === 'running') return job.details || 'Sync is running...';
    return message;
  };

  return (
    <div>
      <button onClick={startSync} disabled={isLoading || job?.status === 'running' || job?.status === 'pending'}>
        {getButtonText()}
      </button>
      <p>{getStatusMessage()}</p>
    </div>
  );
}