import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // --- START DIAGNOSTIC LOGS ---
  console.log("--- AUTH CALLBACK INITIATED ---");
  console.log("Full Request URL:", request.url);
  console.log("Authorization Code received:", code ? "YES" : "NO");

  // Log all cookies to debug PKCE code verifier issue
  const allCookies = request.cookies.getAll();
  console.log("--- COOKIE DIAGNOSTIC ---");
  console.log("Total cookies received:", allCookies.length);
  const codeVerifierCookie = allCookies.find(c => c.name.includes('code-verifier') || c.name.includes('verifier'));
  console.log("Code verifier cookie found:", !!codeVerifierCookie);
  if (codeVerifierCookie) {
    console.log("Code verifier cookie name:", codeVerifierCookie.name);
  }
  // Log all Supabase-related cookies
  const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
  console.log("Supabase cookies found:", supabaseCookies.length);
  supabaseCookies.forEach(c => console.log(`  - ${c.name}: ${c.value.substring(0, 20)}...`));
  console.log("--- END COOKIE DIAGNOSTIC ---");

  // Create response for redirect
  const redirectUrl = new URL(`${requestUrl.origin}/dashboard`);
  redirectUrl.searchParams.set('auth', 'success');
  redirectUrl.searchParams.set('t', Date.now().toString());
  const response = NextResponse.redirect(redirectUrl);

  // Create Supabase client with proper cookie handling for route handlers
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Don't check for existing user BEFORE exchanging code
  // This can interfere with PKCE code verifier retrieval
  // The code verifier is needed for exchangeCodeForSession to work

  if (code) {
    try {
      // Exchange code for session - this requires the code verifier cookie
      // which should have been set when signInWithOAuth was called
      console.log("Attempting to exchange code for session...");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Supabase exchangeCodeForSession ERROR:", error.message);
        console.error("Error details:", JSON.stringify(error, null, 2));
        
        // If it's a PKCE error, Supabase might have still created a session through refresh token
        // Wait a moment for any async session creation to complete
        if (error.message.includes('code verifier') || error.message.includes('code_verifier') || error.message.includes('non-empty')) {
          console.error("❌ PKCE CODE VERIFIER ERROR DETECTED");
          console.error("Waiting briefly to check if session was created via refresh token...");
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for async operations
        }
        
        // ALWAYS check if user is authenticated after error - the code might have been used successfully
        // even if exchangeCodeForSession returned an error (race condition, double call, etc.)
        // Try getSession first as it might be more reliable than getUser
        const { data: sessionData } = await supabase.auth.getSession();
        const { data: { user: checkUser } } = await supabase.auth.getUser();
        
        if (sessionData?.session || checkUser) {
          console.log("⚠️ Exchange failed but session/user IS authenticated.");
          if (sessionData?.session) {
            console.log("Session found via getSession(). User ID:", sessionData.session.user.id);
          }
          if (checkUser) {
            console.log("User found via getUser(). User ID:", checkUser.id);
          }
          console.log("Redirecting to dashboard (session was likely created via refresh token or code was already processed).");
          response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          response.headers.set('Pragma', 'no-cache');
          response.headers.set('Expires', '0');
          return response;
        }
        
        // If we get here, the exchange truly failed and user is not authenticated
        console.error("❌ Authentication failed. User is not authenticated.");
        console.error("Session check result:", !!sessionData?.session);
        console.error("User check result:", !!checkUser);
        return NextResponse.redirect(`${requestUrl.origin}/login?error=Could not exchange code for session: ${error.message}`);
      }
      
      console.log("Successfully exchanged code for session.");
      
      if (data.session) {
        console.log("--- SESSION DIAGNOSTIC ---");
        console.log("Provider Token:", data.session.provider_token ? "EXISTS" : "MISSING");
        console.log("Access Token:", data.session.access_token ? "EXISTS" : "MISSING");
        console.log("User ID:", data.user.id);
        console.log("User Email:", data.user.email);
        console.log("Provider:", data.user.app_metadata.provider);
        console.log("--- END SESSION DIAGNOSTIC ---");
        
        // Verify session is properly set by getting it again
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("--- SESSION VERIFICATION ---");
        console.log("Session exists after exchange:", !!sessionData.session);
        console.log("User exists in session:", !!sessionData.session?.user);
        console.log("--- END SESSION VERIFICATION ---");
        
        // Create profile if it doesn't exist
        try {
          const { data: existingProfile, error: profileCheckError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', data.user.id)
            .maybeSingle();
          
          if (profileCheckError && profileCheckError.code !== 'PGRST116') {
            // PGRST116 is "not found" which is expected, other errors are real issues
            console.error("Error checking profile:", profileCheckError);
          }
          
          if (!existingProfile) {
            console.log("📝 Profile not found. Creating profile for user:", data.user.id);
            
            const provider = data.user.app_metadata?.provider || 'google';
            const providerId = data.user.app_metadata?.provider_id || 
                              data.user.user_metadata?.provider_id || 
                              data.user.email || '';
            const fullName = data.user.user_metadata?.full_name || 
                           data.user.user_metadata?.name || 
                           null;
            
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                email: data.user.email || '',
                full_name: fullName,
                provider: provider,
                provider_id: providerId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single();
            
            if (createError) {
              console.error("❌ Failed to create profile:", createError);
              // Don't fail the auth flow if profile creation fails
              // The database trigger or sync-threads fallback will handle it
            } else {
              console.log("✅ Profile created successfully:", newProfile.id);
            }
          } else {
            console.log("✅ Profile already exists for user:", data.user.id);
          }
        } catch (profileError) {
          console.error("❌ Error in profile creation logic:", profileError);
          // Don't fail the auth flow - continue to dashboard
        }
        
        // Add a small delay to ensure session is fully established
        console.log("Waiting for session to be fully established...");
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Final session check before redirect
        const { data: finalSession } = await supabase.auth.getSession();
        console.log("--- FINAL SESSION CHECK ---");
        console.log("Final session exists:", !!finalSession.session);
        console.log("Final user exists:", !!finalSession.session?.user);
        console.log("--- END FINAL SESSION CHECK ---");
      } else {
        console.warn("WARNING: Session object is null after successful code exchange.");
      }

      // Response already has redirect URL set and cookies from setAll above
      // Add cache control headers to prevent caching issues
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      
      console.log("--- REDIRECT DIAGNOSTIC ---");
      console.log("Redirecting to:", response.headers.get('location'));
      console.log("Cookies being set:", response.cookies.getAll().map(c => c.name));
      console.log("--- END REDIRECT DIAGNOSTIC ---");
      
      return response;

    } catch (e) {
      const error = e as Error;
      console.error("FATAL ERROR in auth callback:", error.message);
      return NextResponse.redirect(`${requestUrl.origin}/login?error=An unexpected error occurred during authentication.`);
    }
  } else {
    // No code provided - check if user is already authenticated
    const { data: { user: noCodeUser } } = await supabase.auth.getUser();
    if (noCodeUser) {
      console.log("No code provided but user is authenticated. Redirecting to dashboard.");
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      return response;
    }
    
    console.warn("WARNING: Auth callback was called without an authorization code.");
    console.log("Redirecting to login page due to missing authorization code.");
    return NextResponse.redirect(`${requestUrl.origin}/login?error=No authorization code provided`);
  }
}