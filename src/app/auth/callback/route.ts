//
// ⚠️ THIS IS THE DIAGNOSTIC VERSION of /auth/callback/route.ts ⚠️
//
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // --- START DIAGNOSTIC LOGS ---
  console.log("--- AUTH CALLBACK INITIATED ---");
  console.log("Full Request URL:", request.url);
  console.log("Authorization Code received:", code ? "YES" : "NO");

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Supabase exchangeCodeForSession ERROR:", error.message);
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

    } catch (e) {
      const error = e as Error;
      console.error("FATAL ERROR in auth callback:", error.message);
      return NextResponse.redirect(`${requestUrl.origin}/login?error=An unexpected error occurred during authentication.`);
    }
  } else {
    console.warn("WARNING: Auth callback was called without an authorization code.");
    console.log("Redirecting to login page due to missing authorization code.");
    return NextResponse.redirect(`${requestUrl.origin}/login?error=No authorization code provided`);
  }

  // Redirect user to the dashboard with a fallback mechanism
  const redirectUrl = `${requestUrl.origin}/dashboard`;
  console.log("--- REDIRECT DIAGNOSTIC ---");
  console.log("Redirecting to:", redirectUrl);
  console.log("Request origin:", requestUrl.origin);
  console.log("--- END REDIRECT DIAGNOSTIC ---");
  
  // Create a response with the redirect and add a query parameter to help with debugging
  const response = NextResponse.redirect(`${redirectUrl}?auth=success&t=${Date.now()}`);
  
  // Ensure the session cookies are properly set in the response
  console.log("Setting response headers for session persistence");
  
  // Add cache control headers to prevent caching issues
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  
  return response;
}