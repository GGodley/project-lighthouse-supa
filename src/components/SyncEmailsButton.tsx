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
      const providerToken = (session as any)?.provider_token as string | undefined;
      if (!providerToken) {
        setMessage('Error: Missing provider token. Please re-authenticate with Google.');
        setSyncStatus('failed');
        await supabase.from('sync_jobs').update({ status: 'failed', details: 'Missing provider_token from session' }).eq('id', job.id);
        return;
      }

      await supabase.functions.invoke('sync-emails', {
        body: { jobId: job.id, provider_token: providerToken },
      });
    } catch (invokeError: any) {
      setMessage(`Error invoking function: ${invokeError.message}`);
      setSyncStatus('failed');
      await supabase.from('sync_jobs').update({ status: 'failed', details: invokeError.message }).eq('id', job.id);
    }
  };

  useEffect(() => {
    if (syncStatus !== 'running') return;

    const interval = setInterval(async () => {
      const { data: latestJob } = await supabase
        .from('sync_jobs')
        .select('status, details')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestJob?.status === 'completed' || latestJob?.status === 'failed') {
        setSyncStatus(latestJob.status as 'completed' | 'failed');
        setMessage(latestJob.details || `Sync ${latestJob.status}.`);
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


