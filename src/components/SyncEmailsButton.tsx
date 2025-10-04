//
// ⚠️ PROMPT FOR CURSOR: Create this file at src/components/SyncEmailsButton.tsx ⚠️
//
'use client';
import { useState } from 'react';

export default function SyncEmailsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSync = async () => {
    setIsLoading(true);
    setMessage('Initiating sync...');

    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start sync.');
      }

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