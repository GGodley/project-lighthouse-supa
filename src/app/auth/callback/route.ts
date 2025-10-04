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

  // Redirect user to the dashboard
  const redirectUrl = `${requestUrl.origin}/dashboard`;
  console.log("--- REDIRECT DIAGNOSTIC ---");
  console.log("Redirecting to:", redirectUrl);
  console.log("Request origin:", requestUrl.origin);
  console.log("--- END REDIRECT DIAGNOSTIC ---");
  
  return NextResponse.redirect(redirectUrl);
}