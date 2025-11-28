const { createClient } = supabase;

// IMPORTANT: Replace with your actual Supabase Project URL and Anon Key
const SUPABASE_URL = 'https://fdaqphksmlmupyrsatcz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkYXFwaGtzbWxtdXB5cnNhdGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzIwNTMsImV4cCI6MjA3NDA0ODA1M30.l4cLThHBHj13Zxi7FPS1WN_aXl1ZPEmSpNOMKV35FoQ';

console.log("app.js script loaded.");
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase client created. URL:", SUPABASE_URL);

// DOM Elements
const loginView = document.getElementById('loginView');
const dashboard = document.getElementById('dashboard');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncEmailsBtn = document.getElementById('syncEmailsBtn');
const userEmailSpan = document.getElementById('userEmail');
const loadingSpinner = document.getElementById('loadingSpinner');
const emailList = document.getElementById('emailList');

// Helper function to get the base URL for redirects (without any path segments)
function getRedirectBaseUrl() {
    // Use NEXT_PUBLIC_SITE_URL if available (set in Vercel env vars)
    // Fall back to current origin (works for localhost and any domain)
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    
    // Remove any trailing slashes
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    // Remove any path segments (like /dashboard) - we only want the base domain
    try {
        const urlObj = new URL(baseUrl);
        baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch {
        // If URL parsing fails, ensure it has protocol
        if (!baseUrl.includes('http')) {
            baseUrl = baseUrl.includes('localhost') ? `http://${baseUrl}` : `https://${baseUrl}`;
        }
    }
    
    return baseUrl;
}

// Helper function to get the OAuth callback URL
function getAuthCallbackUrl() {
    return `${getRedirectBaseUrl()}/auth/callback`;
}

// --- AUTHENTICATION ---
signInBtn.addEventListener('click', async () => {
    console.log('Starting Google sign-in redirect...');
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Force first-party redirect to avoid popup blockers
            preferRedirect: true,
            redirectTo: getAuthCallbackUrl(),
            scopes: 'https://www.googleapis.com/auth/gmail.readonly',
            // Ask Google to show consent and grant offline access
            queryParams: {
                prompt: 'consent',
                access_type: 'offline'
            },
        },
    });
});

signOutBtn.addEventListener('click', async () => {
    console.log('Sign out clicked');
    signOutBtn.disabled = true;
    try {
        // Prefer global sign-out (revokes refresh token server-side) and clears local
        const { error } = await supabaseClient.auth.signOut({ scope: 'global' });
        if (error) {
            console.warn('Global sign-out failed, falling back to local:', error);
            const { error: localErr } = await supabaseClient.auth.signOut({ scope: 'local' });
            if (localErr) throw localErr;
        }

        // Optimistically update UI
        dashboard.classList.add('hidden');
        loginView.classList.remove('hidden');
        emailList.innerHTML = '';

        // Best-effort: purge any persisted auth tokens in storage
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (k.startsWith('sb-') && k.endsWith('-auth-token')) keysToRemove.push(k);
                if (k.includes('supabase.auth.token')) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            sessionStorage.clear();
        } catch (storageErr) {
            console.warn('Storage cleanup warning:', storageErr);
        }

        // Force a hard reload to clear any persisted state in memory
        setTimeout(() => {
            location.reload();
        }, 50);
    } catch (err) {
        console.error('Error during sign out:', err);
        alert(`Sign out failed: ${err.message || err}`);
        signOutBtn.disabled = false;
    }
});

// Listen for auth changes to manage UI
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log(`Auth event detected: ${event}`);

  if (session) {
    // Show dashboard immediately when a session exists (covers INITIAL_SESSION and SIGNED_IN)
    loginView.classList.add('hidden');
    dashboard.classList.remove('hidden');
    userEmailSpan.textContent = session.user?.email || '';

    if (event === 'SIGNED_IN' && session.provider_token) {
      console.log('SIGNED_IN with provider_token → syncing emails...');
      await syncAndDisplayEmails(session);
    } else {
      console.log('Session present → fetching existing emails only...');
      await fetchAndDisplayEmails();
    }
  } else {
    // No session → show login UI
    dashboard.classList.add('hidden');
    loginView.classList.remove('hidden');
    emailList.innerHTML = '';
  }
});

// --- DATA LOGIC ---
syncEmailsBtn.addEventListener('click', async () => {
    console.log("--- 'Sync Emails' button clicked! ---");
    loadingSpinner.classList.remove('hidden');
    emailList.innerHTML = '<p class="text-center">Refreshing permissions and syncing...</p>';

    try {
        console.log("Starting Google re-auth flow to refresh provider token...");
        // Step 1: Re-authenticate with Google. This is the FIX.
        // This will open the popup to get a fresh, valid provider_token from Google.
        // Since the user is already signed into their Google account, they usually just
        // have to click their name.
        const { error: signInError } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: getAuthCallbackUrl(),
                scopes: 'https://www.googleapis.com/auth/gmail.readonly',
            },
        });
        if (signInError) {
            console.error("Re-auth error:", signInError);
            throw signInError;
        }

        // NOTE: The Supabase client automatically handles the redirect. After the user
        // successfully re-authenticates, the onAuthStateChange listener will fire with
        // the new, fresh session. To keep the logic clean, we will trigger the sync
        // from there. This button's only job is to start the re-authentication.

    } catch (error) {
        console.error('Error during re-authentication:', error);
        emailList.innerHTML = `<p class="text-red-500 text-center">Error: ${error.message}</p>`;
        loadingSpinner.classList.add('hidden');
    }
});

// Manual sync trigger (isolated from auth events)
document.getElementById('manualSyncBtn')?.addEventListener('click', async () => {
    console.log('--- Manual Sync Triggered ---');
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        console.log('Manually fetched session:', session);
        await syncAndDisplayEmails(session);
    } else {
        console.log('Manual trigger failed: No active session.');
    }
});

async function fetchAndDisplayEmails() {
    emailList.innerHTML = '<p class="text-center">Loading emails...</p>';
    try {
        const { data: emails, error } = await supabaseClient
            .from('emails')
            .select('*')
            .order('received_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (emails.length === 0) {
            emailList.innerHTML = '<p class="text-center text-gray-500">No emails found. Try syncing them first!</p>';
            return;
        }

        emailList.innerHTML = emails.map(email => `
            <div class="border-b p-4">
                <p class="font-bold">${email.subject}</p>
                <p class="text-sm text-gray-600">From: ${email.sender}</p>
                <p class="text-sm text-gray-500 mt-1">${email.snippet}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error fetching emails:', error);
        emailList.innerHTML = `<p class="text-red-500 text-center">Error: ${error.message}</p>`;
    }
}

// Create a new, combined sync and display function
async function syncAndDisplayEmails(session) {
    console.log("Attempting to invoke 'sync-emails' function...");
    loadingSpinner.classList.remove('hidden');
    emailList.innerHTML = '<p class="text-center">Syncing emails...</p>';
    try {
        // Guard clause: prevent premature invocation without provider_token
        if (!session || !session.provider_token) {
          console.warn('Sync function was called prematurely without a provider_token. Aborting the call.');
          return;
        }

        // 2. Extract token into a simple string and build a clean body
        const accessToken = session.access_token;
        const tokenToSend = session.provider_token;
        const requestBody = { provider_token: tokenToSend };

        console.log('Attempting to invoke function with this clean body:', requestBody);

        // 3. Invoke function with clean body and auth header
        const { data, error } = await supabaseClient.functions.invoke('sync-emails', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: requestBody
        });

        if (error) {
            throw error;
        }

        console.log("Function invocation successful. Data:", data);
        await fetchAndDisplayEmails(); // Refresh list after syncing

    } catch (error) {
        console.error("Error during sync:", error);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}
