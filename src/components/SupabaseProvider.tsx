'use client';
import { createContext, useContext, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

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

  // Removed aggressive cookie clearing to prevent authentication issues

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
