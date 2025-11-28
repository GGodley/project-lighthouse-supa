'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from './SupabaseProvider';
import { isMissingRefreshToken, triggerReAuthWithConsent } from '@/lib/auth/refresh-token-handler';
import { useRouter, usePathname } from 'next/navigation';

export default function EmailSyncManager() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [hasSyncedThisSession, setHasSyncedThisSession] = useState(false);
  const supabase = useSupabase();
  const router = useRouter();
  const pathname = usePathname();

  // --- START OF REFACTORED LOGIC ---

  const startSync = useCallback(async () => {
    console.log("✅ 5. startSync function has been called.");
    setSyncStatus('running');
    setMessage('Preparing to sync...');

    // --- DIAGNOSTIC LOG: Session Analysis ---
    console.log("🔍 SESSION DIAGNOSTIC - Before refresh:");
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    console.log("Current session exists:", !!currentSession);
    if (currentSession) {
      const user = currentSession.user; // Get the user object from the session
      
      console.log("Current provider_token:", currentSession.provider_token);
      
      // ✅ CORRECTED LOG: Access the provider from the user's metadata
      console.log("Current provider:", user?.app_metadata?.provider);
      
      console.log("Current access_token:", currentSession.access_token ? "EXISTS" : "MISSING");
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error("6. ERROR: Session retrieval failed or no session found.", sessionError);
      setMessage('Could not verify your session. Please log in again.');
      setSyncStatus('failed');
      return;
    }
    
    // --- DIAGNOSTIC LOG: Post-retrieval Session Analysis ---
    console.log("🔍 SESSION DIAGNOSTIC - After retrieval:");
    console.log("Session exists:", !!session);
    console.log("Provider token:", session.provider_token);
    
    // ✅ CORRECTED LOG: Access the provider from the user's metadata
    console.log("Provider:", session.user?.app_metadata?.provider);
    
    console.log("Access token:", session.access_token ? "EXISTS" : "MISSING");
    console.log("User ID:", session.user?.id);
    console.log("User email:", session.user?.email);
    console.log("--- END SESSION DIAGNOSTIC ---");
    
    // Check for missing refresh token and trigger re-auth if needed
    if (isMissingRefreshToken(session)) {
        console.warn("7. WARNING: Provider token is missing. This indicates a missing refresh token.");
        console.log("Triggering re-authentication with consent to obtain new refresh token...");
        setMessage('Missing Google permissions. Re-authenticating to refresh access...');
        setSyncStatus('running');
        
        try {
          // Build return URL to come back to current page after re-auth
          const returnUrl = pathname ? encodeURIComponent(pathname) : undefined;
          await triggerReAuthWithConsent(supabase, returnUrl);
          // The OAuth flow will redirect, so we don't need to do anything else here
          return;
        } catch (error) {
          console.error("Error triggering re-authentication:", error);
          setMessage('Failed to re-authenticate. Please try again.');
          setSyncStatus('failed');
          return;
        }
    }

    try {
      const { data: job, error: jobError } = await supabase
        .from('sync_jobs')
        .insert({ user_id: session.user.id, status: 'pending' })
        .select()
        .single();

      if (jobError) {
        console.error("8. DATABASE ERROR: Failed to create sync job.", jobError);
        setMessage(`Error creating sync job: ${jobError.message}`);
        setSyncStatus('failed');
        return;
      }

      console.log("9. Sync job created successfully:", job);
      await supabase.functions.invoke('sync-emails', {
        body: { jobId: job.id, provider_token: session.provider_token },
      });
      console.log("10. 'sync-emails' function invoked successfully.");
      setMessage('Sync has been initiated in the background.');

    } catch (e) {
      const error = e as Error;
      console.error("An unexpected error occurred in startSync:", error);
      setMessage(`An unexpected error occurred: ${error.message}`);
      setSyncStatus('failed');
    }
  }, [supabase]);


  useEffect(() => {
    const ensureJobAndStart = async () => {
      console.log("--- [DIAGNOSTIC] Starting Email Sync Check ---");
      console.log("1. Component mounted or auth state changed.");

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.log("2. ❌ No user found. Aborting sync check.");
        return;
      }
      console.log(`2. ✅ User is authenticated. User ID: ${user.id}`);
      
      if (hasSyncedThisSession) {
        console.log("3. ⏭️ Sync has already been initiated this session. Skipping.");
        return;
      }
      console.log("3. ✅ No sync has been initiated this session. Proceeding...");
      
      console.log("4. 🔄 Checking for existing sync jobs in the database...");
      const { data, error: jobError } = await supabase
        .from('sync_jobs')
        .select('status, details')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (jobError) {
          console.error("4. ❌ DATABASE ERROR: Could not fetch latest job.", jobError);
          return;
      }

      const latestJob = data?.[0];
      console.log("4. ✅ Result of sync job check:", latestJob || "No jobs found.");

      if (!latestJob) {
        console.log("5a. ➡️ Decision: New user or no previous sync detected. Starting initial sync.");
        setHasSyncedThisSession(true);
        await startSync();
      } else if (latestJob.status !== 'running') {
        console.log("5b. ➡️ Decision: Previous sync is not running. Starting a new sync for this session.");
        setHasSyncedThisSession(true);
        await startSync();
      } else {
        console.log("5c. ➡️ Decision: A sync job is already running. Monitoring status.");
        setSyncStatus('running');
      }
    };

    // Listen for when a user signs in
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        console.log("Auth event: SIGNED_IN. Re-running sync check.");
        ensureJobAndStart();
      }
    });

    // Also run on initial load in case session is already active
    ensureJobAndStart();

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, hasSyncedThisSession, startSync]);

  // Polling logic remains the same
  useEffect(() => {
     // ...
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


