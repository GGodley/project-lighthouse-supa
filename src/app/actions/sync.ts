'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';

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
 * Reads provider_token from Supabase session (not cookies).
 * Trigger.dev handles queue management, so no database tracking needed.
 * 
 * @returns Object with success status and optional error message
 * @throws Error("Unauthorized") if user not authenticated
 * @throws Error if trigger fails
 */
export async function startGmailSync(): Promise<{ success: boolean; handle?: TriggerDevHandle; error?: string; redirectToLogin?: boolean; needsGoogleReconnect?: boolean }> {
  // Safe environment variable presence check (booleans only, no values)
  console.log("[ENV] presence", {
    hasNextPublicUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasNextPublicAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasAltServiceRole: !!process.env.SUPABASE_SERVICE_ROLE,
    vercelEnv: process.env.VERCEL_ENV,
  });

  // Initialize Supabase client using cookies-bound SSR pattern
  const supabase = await createClient();

  // Get session (not just user) to access provider_token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  // Check authentication
  if (sessionError || !session?.user) {
    return { success: false, error: 'Session expired. Please log in again.', redirectToLogin: true };
  }

  const user = session.user;

  // Get access token from session.provider_token (Supabase OAuth standard)
  const accessToken = session.provider_token;

  console.log('🔍 [STAGE 1] Session Check:', {
    hasProviderToken: !!accessToken,
    providerTokenLength: accessToken?.length || 0,
    userId: user.id,
  });

  // If provider_token is missing, user needs to reconnect Google (not login)
  if (!accessToken) {
    console.error('❌ [FINAL] Google access token not found in session');
    return {
      success: false,
      error: 'Google connection missing. Please reconnect Google.',
      needsGoogleReconnect: true,
    };
  }

  console.log('✅ [STAGE 6] Access token obtained, proceeding to token storage:', {
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken.length,
  });

  // Store the access token in google_tokens table using service role client
  // CRITICAL: Use service role client to bypass RLS (user session client will be blocked)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ [STAGE 6] Missing Supabase configuration for token storage');
    throw new Error('Missing Supabase configuration for token storage');
  }
  
  const supabaseAdmin = createSupabaseAdminClient(
    supabaseUrl,
    supabaseServiceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  
  try {
    console.log('💾 [STAGE 6] Storing access token in google_tokens table...');
    const { error: tokenError } = await supabaseAdmin
      .from('google_tokens')
      .upsert({ 
        user_id: user.id,
        access_token: accessToken,
        expires_at: null, // Don't guess expiry - treat as valid until Gmail rejects
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (tokenError) {
      console.error('❌ [STAGE 6] Failed to store token:', {
        error: tokenError.message,
        code: tokenError.code,
      });
      throw new Error(`Failed to store access token: ${tokenError.message}`);
    }
    
    console.log('✅ [STAGE 6] Token stored successfully in google_tokens table');
  } catch (storeError) {
    console.error('❌ [STAGE 6] Failed to store token:', {
      error: storeError instanceof Error ? storeError.message : String(storeError),
      stack: storeError instanceof Error ? storeError.stack : undefined,
    });
    throw new Error(`Failed to store access token: ${storeError instanceof Error ? storeError.message : String(storeError)}`);
  }

  // Get Trigger.dev API key from environment
  console.log('🔍 [STAGE 7] Checking Trigger.dev configuration...');
  const triggerApiKey = process.env.TRIGGER_API_KEY;
  if (!triggerApiKey) {
    console.error('❌ [STAGE 7] TRIGGER_API_KEY environment variable is not set');
    throw new Error('TRIGGER_API_KEY environment variable is not set');
  }
  
  console.log('✅ [STAGE 7] Trigger.dev API key found:', {
    hasApiKey: !!triggerApiKey,
    apiKeyLength: triggerApiKey.length,
  });

  // Trigger Trigger.dev job via HTTP API (works in Server Actions)
  const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/ingest-threads/trigger';
  const triggerPayload = {
    payload: {
      userId: user.id,
      // No longer passing encryptedAccessToken - token is now in google_tokens table
    },
    concurrencyKey: user.id,
  };

  console.log('📡 [STAGE 7] Sending request to Trigger.dev:', {
    url: triggerUrl,
    userId: user.id,
    payloadKeys: Object.keys(triggerPayload),
  });

  try {
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerPayload),
    });

    console.log('📡 [STAGE 7] Trigger.dev Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [STAGE 7] Trigger.dev API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
      });
      throw new Error(`Failed to trigger job: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ [STAGE 7] Trigger.dev job triggered successfully:', {
      hasResult: !!result,
      resultKeys: Object.keys(result),
      handleId: result?.id || null,
    });
    
    return { success: true, handle: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('❌ [STAGE 7] Failed to start Gmail sync:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to start Gmail sync: ${errorMessage}`);
  }
}

/**
 * Server Action to start Calendar sync via Trigger.dev
 * 
 * This action triggers the 'sync-calendar' Trigger.dev job which orchestrates
 * fetching Google Calendar events from the Supabase Edge Function.
 * 
 * Token is already stored in google_tokens table (from Gmail sync or auth callback).
 * Trigger.dev handles queue management, so no database tracking needed.
 * 
 * @returns Object with success status and optional error message
 * @throws Error("Unauthorized") if user not authenticated
 * @throws Error if trigger fails
 */
export async function startCalendarSync(): Promise<{ success: boolean; handle?: TriggerDevHandle; error?: string; redirectToLogin?: boolean; needsGoogleReconnect?: boolean }> {
  // Initialize Supabase client using cookies-bound SSR pattern
  const supabase = await createClient();

  // Get session (not just user) to access provider_token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  // Check authentication
  if (sessionError || !session?.user) {
    return { success: false, error: 'Session expired. Please log in again.', redirectToLogin: true };
  }

  const user = session.user;

  console.log('🔍 [CALENDAR SYNC] Session Check:', {
    userId: user.id,
  });

  // Get Trigger.dev API key from environment
  const triggerApiKey = process.env.TRIGGER_API_KEY;
  if (!triggerApiKey) {
    console.error('❌ [CALENDAR SYNC] TRIGGER_API_KEY environment variable is not set');
    throw new Error('TRIGGER_API_KEY environment variable is not set');
  }

  // Trigger Trigger.dev job via HTTP API (works in Server Actions)
  const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/sync-calendar/trigger';
  const triggerPayload = {
    payload: {
      userId: user.id,
      // Token is fetched from google_tokens table by the Edge Function
    },
    concurrencyKey: user.id,
  };

  console.log('📡 [CALENDAR SYNC] Sending request to Trigger.dev:', {
    url: triggerUrl,
    userId: user.id,
  });

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
      console.error('❌ [CALENDAR SYNC] Trigger.dev API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
      });
      throw new Error(`Failed to trigger calendar sync: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ [CALENDAR SYNC] Trigger.dev job triggered successfully:', {
      hasResult: !!result,
      handleId: result?.id || null,
    });
    
    return { success: true, handle: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('❌ [CALENDAR SYNC] Failed to start calendar sync:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to start calendar sync: ${errorMessage}`);
  }
}
