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

// Global flag to prevent multiple simultaneous redirects
let redirectInProgress = false;

/**
 * Validates that a returnUrl is safe (same-origin) to prevent open redirects
 */
function isValidReturnUrl(url: string | null): boolean {
  if (!url) return false;
  
  try {
    // If it's a relative path, it's safe
    if (url.startsWith('/')) {
      // Ensure it doesn't start with // (protocol-relative URL)
      if (!url.startsWith('//')) {
        return true;
      }
    }
    
    // If it's an absolute URL, check same-origin
    const returnUrlObj = new URL(url, window.location.origin);
    const currentOrigin = window.location.origin;
    
    return returnUrlObj.origin === currentOrigin;
  } catch {
    // Invalid URL format
    return false;
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
 * Custom fetch wrapper that intercepts 401 responses
 * 
 * @param input - Same as native fetch() input parameter
 * @param init - Same as native fetch() init parameter
 * @returns Promise<Response>
 * 
 * @example
 * ```ts
 * const response = await apiFetch('/api/customers');
 * const data = await response.json();
 * ```
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Get current pathname for returnUrl
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';

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
 * @returns Promise with parsed JSON data
 * 
 * @example
 * ```ts
 * const data = await apiFetchJson('/api/customers');
 * ```
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(input, init);

  if (!response.ok) {
    // If it's a 401, we've already handled the redirect
    // But we should still throw an error for the calling code
    if (response.status === 401) {
      throw new Error('Unauthorized - redirecting to login');
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

  return response.json();
}

/**
 * Resets the redirect-in-progress flag
 * Useful for testing or manual reset scenarios
 */
export function resetRedirectFlag(): void {
  redirectInProgress = false;
}

