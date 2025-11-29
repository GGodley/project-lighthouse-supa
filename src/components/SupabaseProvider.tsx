'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type SupabaseContext = {
  supabase: SupabaseClient<Database>;
};

const Context = createContext<SupabaseContext | undefined>(undefined);

export default function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => {
    // --- START DIAGNOSTIC LOG ---
    console.log("🔍 SupabaseProvider is initializing client with the following configuration:");
    console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("Anon Key:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log("Environment:", process.env.NODE_ENV);
    console.log("--- END DIAGNOSTIC LOG ---");
    
    // Use the custom client from lib/supabase/client instead of auth-helpers
    return createClient();
  });

  const router = useRouter();
  const pathname = usePathname();
  const redirectInProgress = useRef(false);
  const authListenerInitialized = useRef(false);
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const checkInProgress = useRef(false);

  // Global auth state monitoring - handles token expiration and auth failures
  useEffect(() => {
    if (authListenerInitialized.current) return;
    authListenerInitialized.current = true;

    /**
     * Handles session expiration by clearing session and redirecting to login
     */
    const handleSessionExpired = async () => {
      // Prevent redirect loops - don't redirect if already on login page or auth callback
      if (pathname?.startsWith('/login') || pathname?.startsWith('/auth')) {
        console.log('⏭️ Already on auth page, skipping redirect');
        return;
      }

      // Prevent multiple simultaneous redirects
      if (redirectInProgress.current) {
        console.log('⏭️ Redirect already in progress, skipping');
        return;
      }

      redirectInProgress.current = true;
      console.log('🔄 Session expired, redirecting to login...');

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
          console.log('🔄 No session found in validation, redirecting to login...');
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
            console.log('🔄 Session expired or expiring soon in validation, redirecting to login...');
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
     * Handles page visibility changes - checks session when user returns to tab
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Page became visible, validating session...');
        validateSession();
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state change:', event, session ? 'Session exists' : 'No session');

      // Handle sign out events (token expiration, manual logout, etc.)
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        await handleSessionExpired();
      }

      // Handle failed token refresh - when refresh fails, session becomes null
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.log('❌ Token refresh failed, session is null');
        await handleSessionExpired();
      }

      // Handle successful token refresh
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('✅ Token refreshed successfully');
        redirectInProgress.current = false; // Reset flag on successful refresh
        
        // Validate the refreshed session to ensure it's actually valid
        const isValid = await validateSession();
        if (!isValid) {
          console.log('⚠️ Refreshed session failed validation');
        }
      }

      // Handle sign in events
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ User signed in successfully');
        redirectInProgress.current = false; // Reset flag on sign in
      }
    });

    // Set up periodic session validation (every 5 minutes)
    sessionCheckInterval.current = setInterval(() => {
      validateSession();
    }, 5 * 60 * 1000);

    // Set up visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial session validation on mount
    validateSession();

    return () => {
      subscription.unsubscribe();
      authListenerInitialized.current = false;
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [supabase, router, pathname]);

  return (
    <Context.Provider value={{ supabase }}>
      {children}
    </Context.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context.supabase;
};
