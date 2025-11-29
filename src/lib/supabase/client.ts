import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // --- CLIENT CREATION DIAGNOSTIC ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  console.log("🔧 Creating Supabase client with:");
  console.log("  - URL:", supabaseUrl);
  console.log("  - Anon Key (first 20 chars):", supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + "..." : "UNDEFINED");
  console.log("  - URL domain:", supabaseUrl ? new URL(supabaseUrl).hostname : "UNDEFINED");
  
  // createBrowserClient from @supabase/ssr automatically handles PKCE code verifier storage
  // It stores the code verifier in a cookie that the server-side callback can read
  // No manual cookie configuration needed - it's handled automatically
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
