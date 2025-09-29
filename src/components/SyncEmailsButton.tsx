'use client';
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database.types';

export default function SyncEmailsButton() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const supabase = createClientComponentClient<Database>();

  const startSync = async () => {
    setSyncStatus('running');
    setMessage('Sync has been initiated in the background...');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage('Error: Not authenticated.');
      setSyncStatus('failed');
      return;
    }

    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({ user_id: session.user.id, status: 'pending' })
      .select()
      .single();

    if (jobError) {
      setMessage(`Error creating sync job: ${jobError.message}`);
      setSyncStatus('failed');
      return;
    }

    try {
      const providerToken = (session as { provider_token?: string })?.provider_token;
      if (!providerToken) {
        setMessage('Error: Missing provider token. Please re-authenticate with Google.');
        setSyncStatus('failed');
        await supabase.from('sync_jobs').update({ status: 'failed', details: 'Missing provider_token from session' }).eq('id', job.id);
        return;
      }

      await supabase.functions.invoke('sync-emails', {
        body: { jobId: job.id, provider_token: providerToken },
      });
    } catch (invokeError: unknown) {
      const errMsg = invokeError instanceof Error ? invokeError.message : 'Unknown error invoking function';
      setMessage(`Error invoking function: ${errMsg}`);
      setSyncStatus('failed');
      await supabase.from('sync_jobs').update({ status: 'failed', details: errMsg }).eq('id', job.id);
    }
  };

  useEffect(() => {
    if (syncStatus !== 'running') return;

    type SyncJob = Database['public']['Tables']['sync_jobs']['Row'];

    const interval = setInterval(async () => {
      const { data: latestJob } = await supabase
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const typedJob = latestJob as SyncJob | null;
      if (typedJob?.status === 'completed' || typedJob?.status === 'failed') {
        setSyncStatus(typedJob.status as 'completed' | 'failed');
        setMessage(typedJob.details || `Sync ${typedJob.status}.`);
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [syncStatus, supabase]);

  return (
    <div>
      <button onClick={startSync} disabled={syncStatus === 'running'}>
        {syncStatus === 'running' ? 'Sync in Progress...' : 'Sync My Emails'}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}


