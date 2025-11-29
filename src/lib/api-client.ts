/**
 * Centralized API Client Wrapper
 * 
 * Provides a fetch wrapper that:
 * - Intercepts 401 Unauthorized responses
 * - Automatically redirects to login with returnUrl
 * - Prevents duplicate redirects
 * - Clears stale authentication state
 * 
 * This serves as a defense-in-depth layer for API calls that bypass
 * Supabase's built-in auth state monitoring.
 */

'use client';

import { createClient } from '@/lib/supabase/client';
import { triggerReAuthWithConsent } from '@/lib/auth/refresh-token-handler';

// Global flag to prevent multiple simultaneous redirects
let redirectInProgress = false;
let reAuthInProgress = false;

/**
 * Error code that indicates missing refresh token
 */
export const MISSING_REFRESH_TOKEN_ERROR = 'MISSING_REFRESH_TOKEN';

/**
 * Handles missing refresh token by triggering re-authentication with consent
 */
async function handleMissingRefreshToken(currentPath: string): Promise<void> {
  // Prevent duplicate re-auth attempts
  if (reAuthInProgress) {
    console.log('⏭️ Re-authentication already in progress, skipping');
    return;
  }

  // Don't trigger re-auth if already on login or auth pages
  if (currentPath.startsWith('/login') || currentPath.startsWith('/auth')) {
    console.log('⏭️ Already on auth page, skipping re-auth');
    return;
  }

  reAuthInProgress = true;
  console.log('🔄 Missing refresh token detected, triggering re-authentication with consent...');

  try {
    const supabase = createClient();
    const returnUrl = currentPath && currentPath !== '/' 
      ? encodeURIComponent(currentPath) 
      : undefined;
    
    await triggerReAuthWithConsent(supabase, returnUrl);
    // The OAuth flow will redirect, so we don't need to reset the flag here
  } catch (error) {
    console.error('Error triggering re-authentication:', error);
    reAuthInProgress = false;
  }
}

/**
 * Handles 401 Unauthorized responses by redirecting to login
 */
async function handleUnauthorized(currentPath: string): Promise<void> {
  // Prevent duplicate redirects
  if (redirectInProgress) {
    console.log('⏭️ Redirect already in progress, skipping');
    return;
  }

  // Don't redirect if already on login or auth pages
  if (currentPath.startsWith('/login') || currentPath.startsWith('/auth')) {
    console.log('⏭️ Already on auth page, skipping redirect');
    return;
  }

  redirectInProgress = true;
  console.log('🔄 401 Unauthorized detected, redirecting to login...');

  try {
    // Clear stale session data
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error clearing session:', error);
    // Continue with redirect even if signOut fails
  }

  // Build return URL - preserve user's intended destination
  const returnUrl = currentPath && currentPath !== '/' 
    ? encodeURIComponent(currentPath) 
    : undefined;
  
  const loginUrl = returnUrl 
    ? `/login?returnUrl=${returnUrl}`
    : '/login';

  // Small delay to ensure state is cleared before redirect
  setTimeout(() => {
    window.location.href = loginUrl;
    redirectInProgress = false;
  }, 100);
}

/**
 * Validates the current session before making an API call
 * Returns true if session is valid, false if expired/invalid
 */
async function validateSessionBeforeCall(): Promise<boolean> {
  if (typeof window === 'undefined') {
    // Server-side, skip validation
    return true;
  }

  try {
    const supabase = createClient();
    
    // Check if we have a session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (!session || sessionError) {
      console.log('🔄 apiFetch: No session found, will redirect on 401');
      return false;
    }

    // Check if session is expired
    if (session.expires_at) {
      const expiresAt = new Date(session.expires_at * 1000); // expires_at is in seconds
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();

      // If expired or expiring within 1 minute, treat as expired
      if (timeUntilExpiry <= 60 * 1000) {
        console.log('🔄 apiFetch: Session expired or expiring soon');
        return false;
      }
    }

    // Validate session by calling getUser()
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (!user || userError) {
      console.log('🔄 apiFetch: Session validation failed', userError?.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating session in apiFetch:', error);
    return false;
  }
}

/**
 * Options for apiFetch and apiFetchJson
 */
export interface ApiFetchOptions {
  /** Whether to validate session before making the API call (default: false) */
  validateSession?: boolean;
}

/**
 * Custom fetch wrapper that intercepts 401 responses
 * 
 * @param input - Same as native fetch() input parameter
 * @param init - Same as native fetch() init parameter
 * @param options - Optional configuration for session validation
 * @returns Promise<Response>
 * 
 * @example
 * ```ts
 * const response = await apiFetch('/api/customers');
 * const data = await response.json();
 * 
 * // With session validation before call
 * const response = await apiFetch('/api/customers', {}, { validateSession: true });
 * ```
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions
): Promise<Response> {
  // Get current pathname for returnUrl
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';

  // Optionally validate session before making the call
  if (options?.validateSession) {
    const isValid = await validateSessionBeforeCall();
    if (!isValid) {
      // Session is invalid, trigger redirect immediately
      await handleUnauthorized(currentPath);
      // Return a 401 response so calling code can handle it
      return new Response(JSON.stringify({ error: 'Unauthorized - session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const response = await fetch(input, init);

    // Intercept 401 Unauthorized responses
    if (response.status === 401) {
      // Only handle redirect on client side
      if (typeof window !== 'undefined') {
        await handleUnauthorized(currentPath);
      }
      
      // Return the response anyway so calling code can handle it if needed
      return response;
    }

    // Intercept 403 Forbidden responses that indicate missing refresh token
    if (response.status === 403) {
      // Check if the error indicates missing refresh token
      try {
        const errorData = await response.clone().json();
        if (errorData.error === MISSING_REFRESH_TOKEN_ERROR || 
            (typeof errorData.error === 'string' && errorData.error.includes('Missing Google provider token'))) {
          // Only handle re-auth on client side
          if (typeof window !== 'undefined') {
            await handleMissingRefreshToken(currentPath);
          }
        }
      } catch {
        // If JSON parsing fails, ignore and return response as-is
      }
      
      // Return the response anyway so calling code can handle it if needed
      return response;
    }

    return response;
  } catch (error) {
    // Re-throw network errors and other non-401 errors
    // These should be handled by the calling code
    throw error;
  }
}

/**
 * Convenience wrapper for JSON API calls
 * Automatically handles JSON parsing and 401 errors
 * 
 * @param input - Same as native fetch() input parameter
 * @param init - Same as native fetch() init parameter
 * @param options - Optional configuration for session validation
 * @returns Promise with parsed JSON data
 * 
 * @example
 * ```ts
 * const data = await apiFetchJson('/api/customers');
 * 
 * // With session validation before call
 * const data = await apiFetchJson('/api/customers', {}, { validateSession: true });
 * ```
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions
): Promise<T> {
  const response = await apiFetch(input, init, options);

  if (!response.ok) {
    // If it's a 401, we've already handled the redirect
    // But we should still throw an error for the calling code
    if (response.status === 401) {
      throw new Error('Unauthorized - redirecting to login');
    }

    // If it's a 403 with missing refresh token, we've already handled re-auth
    if (response.status === 403) {
      try {
        const errorData = await response.clone().json();
        if (errorData.error === MISSING_REFRESH_TOKEN_ERROR || 
            (typeof errorData.error === 'string' && errorData.error.includes('Missing Google provider token'))) {
          throw new Error('Missing refresh token - re-authenticating');
        }
      } catch {
        // If JSON parsing fails, continue to normal error handling
      }
    }

    // For other errors, try to parse error message
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If JSON parsing fails, use default message
    }

    throw new Error(errorMessage);
  }

  const json: unknown = await response.json();
  return json as T;
}

/**
 * Resets the redirect-in-progress flag
 * Useful for testing or manual reset scenarios
 */
export function resetRedirectFlag(): void {
  redirectInProgress = false;
  reAuthInProgress = false;
}

