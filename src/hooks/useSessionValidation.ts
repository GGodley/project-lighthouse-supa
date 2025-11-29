/**
 * Session Validation Hook
 * 
 * Periodically validates the user's session and automatically redirects to login
 * if the session has expired. Also checks session when the user returns to the tab.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';

interface UseSessionValidationOptions {
  /** Interval in milliseconds for periodic session checks (default: 5 minutes) */
  checkInterval?: number;
  /** Whether to check session on page visibility changes (default: true) */
  checkOnVisibilityChange?: boolean;
  /** Whether to check session immediately on mount (default: true) */
  checkOnMount?: boolean;
}

/**
 * Hook that validates the user's session periodically and on visibility changes
 * 
 * @param options - Configuration options for session validation
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   useSessionValidation({ checkInterval: 300000 }); // 5 minutes
 *   return <div>...</div>;
 * }
 * ```
 */
export function useSessionValidation(options: UseSessionValidationOptions = {}) {
  const {
    checkInterval = 5 * 60 * 1000, // 5 minutes default
    checkOnVisibilityChange = true,
    checkOnMount = true,
  } = options;

  const supabase = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const checkInProgress = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Validates the current session and redirects to login if expired
   */
  const validateSession = async (): Promise<boolean> => {
    // Prevent concurrent validation checks
    if (checkInProgress.current) {
      return false;
    }

    // Don't check if already on login or auth pages
    if (pathname?.startsWith('/login') || pathname?.startsWith('/auth')) {
      return false;
    }

    checkInProgress.current = true;

    try {
      // First, check if we have a session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      // If no session, redirect to login
      if (!session || sessionError) {
        console.log('🔄 No session found, redirecting to login...');
        await handleSessionExpired();
        return false;
      }

      // Check if session is expired by comparing expires_at with current time
      if (session.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000); // expires_at is in seconds
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        // If expired or expiring within 1 minute, treat as expired
        if (timeUntilExpiry <= 60 * 1000) {
          console.log('🔄 Session expired or expiring soon, redirecting to login...');
          await handleSessionExpired();
          return false;
        }
      }

      // Validate session by calling getUser() - this will trigger token refresh if needed
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      // If getUser() fails or returns no user, session is invalid
      if (!user || userError) {
        console.log('🔄 Session validation failed, redirecting to login...', userError?.message);
        await handleSessionExpired();
        return false;
      }

      // Session is valid
      return true;
    } catch (error) {
      console.error('Error validating session:', error);
      // On error, assume session is invalid and redirect
      await handleSessionExpired();
      return false;
    } finally {
      checkInProgress.current = false;
    }
  };

  /**
   * Handles session expiration by clearing session and redirecting to login
   */
  const handleSessionExpired = async () => {
    try {
      // Clear stale session data
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error clearing session:', error);
      // Continue with redirect even if signOut fails
    }

    // Build return URL - preserve user's intended destination
    const returnUrl = pathname && pathname !== '/' ? encodeURIComponent(pathname) : undefined;
    const loginUrl = returnUrl 
      ? `/login?returnUrl=${returnUrl}`
      : '/login';

    // Use window.location for a hard redirect to ensure state is cleared
    window.location.href = loginUrl;
  };

  /**
   * Handles page visibility changes - checks session when user returns to tab
   */
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && checkOnVisibilityChange) {
      console.log('👁️ Page became visible, validating session...');
      validateSession();
    }
  };

  useEffect(() => {
    // Initial check on mount
    if (checkOnMount) {
      validateSession();
    }

    // Set up periodic session validation
    intervalRef.current = setInterval(() => {
      validateSession();
    }, checkInterval);

    // Set up visibility change listener
    if (checkOnVisibilityChange) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (checkOnVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [pathname, checkInterval, checkOnVisibilityChange, checkOnMount]);

  return {
    validateSession,
  };
}

