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

  // Global auth state monitoring - handles token expiration and auth failures
  useEffect(() => {
    if (authListenerInitialized.current) return;
    authListenerInitialized.current = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state change:', event, session ? 'Session exists' : 'No session');

      // Handle sign out events (token expiration, manual logout, etc.)
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
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
        console.log('🔄 Session expired or user signed out, redirecting to login...');

        // Clear any stale session data
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.error('Error clearing session:', error);
        }

        // Build return URL - preserve user's intended destination
        const returnUrl = pathname && pathname !== '/' ? encodeURIComponent(pathname) : undefined;
        const loginUrl = returnUrl 
          ? `/login?returnUrl=${returnUrl}`
          : '/login';

        // Small delay to ensure state is cleared before redirect
        setTimeout(() => {
          router.push(loginUrl);
          redirectInProgress.current = false;
        }, 100);
      }

      // Handle successful token refresh
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('✅ Token refreshed successfully');
        redirectInProgress.current = false; // Reset flag on successful refresh
      }

      // Handle sign in events
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ User signed in successfully');
        redirectInProgress.current = false; // Reset flag on sign in
      }
    });

    return () => {
      subscription.unsubscribe();
      authListenerInitialized.current = false;
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
