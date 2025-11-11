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

  // Check if user is already authenticated (prevents processing callback twice)
  const { data: { user: existingUser } } = await supabase.auth.getUser();
  if (existingUser) {
    console.log("--- USER ALREADY AUTHENTICATED ---");
    console.log("User ID:", existingUser.id);
    console.log("Redirecting to dashboard without processing code (already authenticated)");
    // User is already authenticated, just redirect to dashboard
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  if (code) {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Supabase exchangeCodeForSession ERROR:", error.message);
        
        // Check if error is due to code already being used (idempotency)
        // If user is now authenticated (code was used successfully), just redirect to dashboard
        const { data: { user: checkUser } } = await supabase.auth.getUser();
        if (checkUser) {
          console.log("Code was already used, but user is authenticated. Redirecting to dashboard.");
          response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          response.headers.set('Pragma', 'no-cache');
          response.headers.set('Expires', '0');
          return response;
        }
        
        // If it's a PKCE error about code verifier, check if user is authenticated
        if (error.message.includes('code verifier') || error.message.includes('code_verifier')) {
          const { data: { user: pkceCheckUser } } = await supabase.auth.getUser();
          if (pkceCheckUser) {
            console.log("PKCE error but user is authenticated. Redirecting to dashboard.");
            response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            response.headers.set('Pragma', 'no-cache');
            response.headers.set('Expires', '0');
            return response;
          }
        }
        
        // Redirect to an error page with the error message
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