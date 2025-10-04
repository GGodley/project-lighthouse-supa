import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // --- ENVIRONMENT DIAGNOSTIC ---
  console.log("🔍 AUTH CALLBACK ENVIRONMENT DIAGNOSTIC:");
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("Supabase Anon Key (first 20 chars):", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + "...");
  console.log("Request URL:", request.url);
  console.log("Origin:", origin);
  console.log("Search Params:", Object.fromEntries(searchParams.entries()));

  if (code) {
    console.log("🔍 AUTH CALLBACK DIAGNOSTIC - Processing OAuth callback");
    console.log("Authorization Code:", code);
    console.log("Next redirect:", next);
    
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error("❌ AUTH CALLBACK ERROR - Code exchange failed:");
      console.error("Error message:", error.message);
      console.error("Error details:", error);
      console.error("Error status:", error.status);
      console.error("Error code:", error.code);
      
      // Return error response instead of redirecting
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    if (data) {
      console.log("✅ Code exchange successful");
      
      // Get the user after successful authentication
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        console.log("🔍 USER SESSION DIAGNOSTIC:");
        console.log("User ID:", user.id);
        console.log("User Email:", user.email);
        console.log("User Metadata:", JSON.stringify(user.user_metadata, null, 2));
        console.log("App Metadata:", JSON.stringify(user.app_metadata, null, 2));
        
        // Check for provider tokens
        const session = await supabase.auth.getSession();
        console.log("🔍 SESSION DIAGNOSTIC:");
        console.log("Session exists:", !!session.data.session);
        if (session.data.session) {
          // ✅ CORRECTED LOGIC: Get the session object first.
          const currentSession = session.data.session;
          
          // ✅ Then, get the user object from *inside* the session.
          const user = currentSession.user;

          console.log("--- SESSION DIAGNOSTIC ---");
          console.log("Provider Token:", currentSession.provider_token);
          console.log("Access Token:", currentSession.access_token);
          console.log("Refresh Token:", currentSession.refresh_token);
          console.log("User ID:", user?.id);
          console.log("User Email:", user?.email);
          console.log("Provider:", user?.app_metadata?.provider);
        }
        console.log("--- END SESSION DIAGNOSTIC ---");
        // Create or update user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
            provider: user.app_metadata?.provider || 'google',
            provider_id: user.user_metadata?.provider_id || user.id,
            gmail_access_token: user.user_metadata?.gmail_access_token,
            gmail_refresh_token: user.user_metadata?.gmail_refresh_token,
            microsoft_access_token: user.user_metadata?.microsoft_access_token,
            microsoft_refresh_token: user.user_metadata?.microsoft_refresh_token,
            updated_at: new Date().toISOString()
          })

        if (profileError) {
          console.error('Error creating/updating profile:', profileError)
        }
      }
    }
  } else {
    console.error("❌ AUTH CALLBACK ERROR - No authorization code provided");
    console.error("Request URL:", request.url);
    console.error("Search params:", Object.fromEntries(searchParams.entries()));
    
    // Return error response for debugging
    return NextResponse.json({ 
      error: "No authorization code provided",
      url: request.url,
      params: Object.fromEntries(searchParams.entries())
    }, { status: 400 });
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}${next}`)
}
