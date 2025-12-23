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

  // Fallback: If cookie is missing but session has provider_token, use it and set cookie
  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('🔍 Cookie missing, checking session for provider_token:', {
      hasSession: !!session,
      hasProviderToken: !!session?.provider_token,
      userId: user.id,
    });
    
    if (session?.provider_token) {
      accessToken = session.provider_token;
      // Set the cookie for future requests
      cookieStore.set('google_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      console.log('🍪 Set Google access token cookie from session (fallback)');
    } else {
      console.error('❌ No access token found in cookie or session');
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

