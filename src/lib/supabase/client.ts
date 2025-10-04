import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // --- CLIENT CREATION DIAGNOSTIC ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  console.log("🔧 Creating Supabase client with:");
  console.log("  - URL:", supabaseUrl);
  console.log("  - Anon Key (first 20 chars):", supabaseAnonKey.substring(0, 20) + "...");
  console.log("  - URL domain:", supabaseUrl ? new URL(supabaseUrl).hostname : "UNDEFINED");
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
