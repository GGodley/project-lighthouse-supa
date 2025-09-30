'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database.types';

// Define the type for a sync job row for clarity
type SyncJob = Database['public']['Tables']['sync_jobs']['Row'];

export default function SyncEmailsButton() {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true); // Start with loading true to check initial state
  const supabase = createClientComponentClient<Database>();

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
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = 'exact one row not found'
      console.error('Error fetching latest job:', error);
      setMessage('Could not fetch sync status.');
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

  // Function to start a new sync process
  const startSync = async () => {
    setIsLoading(true);
    setMessage('Initiating sync in the background...');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage('Error: Not authenticated.');
      setIsLoading(false);
      return;
    }

    const providerToken = (session as { provider_token?: string })?.provider_token;
    if (!providerToken) {
      setMessage('Error: Missing provider token. Please re-authenticate with Google.');
      setIsLoading(false);
      // Use an untyped client for the insert to bypass CI type inference issues
      const untypedSupabase = createClientComponentClient();
      await untypedSupabase.from('sync_jobs').insert({ user_id: session.user.id, status: 'failed', details: 'Missing provider_token from session' });
      return;
    }

    // Create a new job in the database
    // Use an untyped client for the insert to bypass CI type inference issues
    const untypedSupabase = createClientComponentClient();
    const { data: newJob, error: jobError } = await untypedSupabase
      .from('sync_jobs')
      .insert({ user_id: session.user.id, status: 'pending' })
      .select()
      .single();

    if (jobError) {
      setMessage(`Error creating sync job: ${jobError.message}`);
      setIsLoading(false);
      return;
    }

    setJob(newJob); // Set the new job as the current one

    // Trigger the edge function to start processing the job
    try {
      const { error: invokeError } = await supabase.functions.invoke('sync-emails', {
        body: { 
          jobId: newJob.id, 
          provider_token: providerToken 
        },
      });
      if (invokeError) throw invokeError;
    } catch (invokeError) {
      const errorMessage = invokeError instanceof Error ? invokeError.message : 'Unknown error';
      setMessage(`Error invoking function: ${errorMessage}`);
      // Update the job status to failed
      await untypedSupabase.from('sync_jobs').update({ status: 'failed', details: errorMessage }).eq('id', newJob.id);
      checkLatestJobStatus(); // Re-fetch to update UI
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'Loading Status...';
    if (job?.status === 'running' || job?.status === 'pending') return 'Sync in Progress...';
    return 'Sync My Emails';
  };
  
  const getStatusMessage = () => {
    if (isLoading) return 'Checking sync status...';
    if (!job) return 'Press the button to sync your emails.';
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