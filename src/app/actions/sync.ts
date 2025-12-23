'use server';

import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/utils/crypto';
import { cookies } from 'next/headers';

/**
 * Trigger.dev API response handle type
 */
interface TriggerDevHandle {
  id?: string | number;
  [key: string]: unknown;
}

/**
 * Server Action to start Gmail sync via Trigger.dev
 * 
 * This action triggers the 'ingest-threads' Trigger.dev job which orchestrates
 * fetching Gmail threads from the Supabase Edge Function with pagination.
 * 
 * Uses Cookie Backpack pattern - reads access token from secure HTTP-only cookie.
 * Trigger.dev handles queue management, so no database tracking needed.
 * 
 * @returns Object with success status and optional error message
 * @throws Error("Unauthorized") if user not authenticated
 * @throws Error if trigger fails
 */
export async function startGmailSync(): Promise<{ success: boolean; handle?: TriggerDevHandle; error?: string; redirectToLogin?: boolean }> {
  // Initialize Supabase client using modern SSR pattern
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  // Check authentication
  if (error || !user) {
    throw new Error('Unauthorized');
  }

  // Retrieve access token from secure cookie (Cookie Backpack pattern)
  const cookieStore = await cookies();
  let accessToken = cookieStore.get('google_access_token')?.value;
  
  console.log('🔍 Token check:', {
    hasCookie: !!accessToken,
    cookieLength: accessToken?.length,
    userId: user.id,
  });

  // Fallback: If cookie is missing but session has provider_token, use it and set cookie
  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:52',message:'Cookie missing - checking session structure',data:{hasSession:!!session,sessionKeys:session?Object.keys(session):[],hasProviderToken:!!session?.provider_token,hasAccessToken:!!session?.access_token,hasRefreshToken:!!session?.refresh_token,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    console.log('🔍 Cookie missing, checking session for provider_token:', {
      hasSession: !!session,
      hasProviderToken: !!session?.provider_token,
      providerTokenLength: session?.provider_token?.length,
      sessionKeys: session ? Object.keys(session) : [],
      userId: user.id,
    });
    
    if (session?.provider_token) {
      accessToken = session.provider_token;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:66',message:'Found provider_token in session - setting cookie',data:{providerTokenLength:accessToken.length,providerTokenPrefix:accessToken.substring(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Set the cookie for future requests
      cookieStore.set('google_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      console.log('🍪 Set Google access token cookie from session (fallback)');
    } else if (session?.provider_refresh_token) {
      // Try to refresh the access token using the refresh token
      console.log('🔄 Have refresh token but no access token, fetching from Google...');
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:82',message:'Attempting to refresh access token from Google in server action',data:{hasRefreshToken:!!session.provider_refresh_token,refreshTokenLength:session.provider_refresh_token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      try {
        const googleClientId = process.env.GOOGLE_CLIENT_ID;
        const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        if (googleClientId && googleClientSecret) {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: session.provider_refresh_token,
              grant_type: 'refresh_token',
            }),
          });
          
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:102',message:'Successfully refreshed access token from Google in server action',data:{hasAccessToken:!!accessToken,accessTokenLength:accessToken?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            // Set the cookie for future requests
            cookieStore.set('google_access_token', accessToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 3600, // 1 hour
              path: '/',
            });
            console.log('🍪 Set Google access token cookie from refreshed token');
          } else {
            const errorText = await tokenResponse.text();
            console.error('❌ Failed to refresh token:', errorText);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:117',message:'Failed to refresh token from Google',data:{status:tokenResponse.status,errorText:errorText.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
          }
        }
      } catch (error) {
        console.error('❌ Error refreshing token:', error);
      }
    }
    
    if (!accessToken) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:125',message:'No access token found after all attempts',data:{allCookies:cookieStore.getAll().map(c=>c.name),sessionExists:!!session,sessionUser:session?.user?.id,hasProviderToken:!!session?.provider_token,hasProviderRefreshToken:!!session?.provider_refresh_token},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.error('❌ No access token found in cookie or session', {
        allCookies: cookieStore.getAll().map(c => c.name),
        sessionExists: !!session,
        sessionUser: session?.user?.id,
      });
      // Return error that indicates redirect is needed
      return { success: false, error: 'Session expired. Please log in again.', redirectToLogin: true };
    }
  }

  // Encrypt the access token
  const encryptedToken = await encryptToken(accessToken);

  // Get Trigger.dev API key from environment
  const triggerApiKey = process.env.TRIGGER_API_KEY;
  if (!triggerApiKey) {
    throw new Error('TRIGGER_API_KEY environment variable is not set');
  }

  // Trigger Trigger.dev job via HTTP API (works in Server Actions)
  const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/ingest-threads/trigger';
  const triggerPayload = {
    payload: {
      userId: user.id,
      encryptedAccessToken: encryptedToken,
    },
    concurrencyKey: user.id,
  };

  try {
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to trigger job: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return { success: true, handle: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to start Gmail sync: ${errorMessage}`);
  }
}

