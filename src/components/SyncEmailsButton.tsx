//
// ⚠️ PROMPT FOR CURSOR: Create this file at src/components/SyncEmailsButton.tsx ⚠️
//
'use client';
import { useState } from 'react';
import { apiFetchJson } from '@/lib/api-client';

export default function SyncEmailsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSync = async () => {
    setIsLoading(true);
    setMessage('Initiating sync...');

    try {
      // Use the centralized API client for automatic 401 handling
      const data = await apiFetchJson<{ message: string }>('/api/sync-emails', {
        method: 'POST',
      });

      setMessage(data.message);
    } catch (error) {
      const err = error as Error;
      setMessage(`Error: ${err.message}`);
    } finally {
      // Keep loading state true, as the job is now running in the background.
      // The main page will use Realtime to show progress.
      setIsLoading(true); 
    }
  };

  return (
    <div>
      <button onClick={handleSync} disabled={isLoading}>
        {isLoading ? 'Sync in Progress...' : 'Sync My Emails'}
      </button>
      {message && <p className="text-sm mt-2">{message}</p>}
    </div>
  );
}