export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Stores the Google access token in the google_tokens table
 * This makes the database the source of truth for tokens
 */
async function storeTokenInDatabase(accessToken: string, userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase config for token storage');
    return;
  }
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  try {
    const { error } = await supabaseAdmin
      .from('google_tokens')
      .upsert({
        user_id: userId,
        access_token: accessToken,
        expires_at: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('❌ Failed to store token in google_tokens:', error.message);
    } else {
      console.log('✅ [CALLBACK] Token stored in google_tokens table');
    }
  } catch (error) {
    console.error('❌ Error storing token:', error instanceof Error ? error.message : String(error));
  }
}

export async function GET(request: NextRequest) {
  // 🟣 CANARY FINGERPRINT - Verify this route is being hit
  console.log("🟣 CALLBACK_CANARY v2025-12-24T1437Z route.ts HIT", {
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    deployment: process.env.VERCEL_DEPLOYMENT_ID,
    host: request.headers.get("host"),
    url: request.url,
  });

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    const res = NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(error_description || error)}`
    );
    res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
    return res;
  }

  if (!code) {
    // TEMPORARY: Return JSON for canary verification
    // After verification, revert to redirect
    const res = NextResponse.json({ 
      ok: true, 
      canary: "CALLBACK_ROUTE_TS_V1437Z",
      message: "No authorization code provided"
    });
    res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
    return res;
    
    // After verification, restore this:
    // const res = NextResponse.redirect(
    //   `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent('No authorization code provided')}`
    // );
    // res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
    // return res;
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => 
              cookieStore.set({ name, value, ...options })
            );
          } catch {
            // ignore
          }
        },
      },
    }
  );

  // Always exchange code if present (removes class of bugs)
  console.log('[CALLBACK] Code present, exchanging...');
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[CALLBACK] Exchange error:', exchangeError.message);
    
    // If exchange failed, treat it as an error and redirect to error page
    // This ensures we don't mask real problems or create "looks logged in but no provider token" states
    const res = NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError.message)}`
    );
    res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
    return res;
  }

  // ✅ OAuth exchange successful
  console.log('[CALLBACK] Exchange successful, exchanged: true');
  
  if (data?.session) {
    const userId = data.session.user.id;
    console.log('[CALLBACK] OAuth exchange successful for user:', userId);
    
    // Store provider_token in google_tokens table (for all flows, not just reconnect)
    if (data.session.provider_token) {
      console.log('[CALLBACK] provider_token present, storing in DB...');
      await storeTokenInDatabase(data.session.provider_token, userId);
    } else {
      console.warn('[CALLBACK] provider_token missing after exchange');
      
      // Try to get it from a fresh session check
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (freshSession?.provider_token) {
        console.log('[CALLBACK] Found provider_token in fresh session, storing in DB...');
        await storeTokenInDatabase(freshSession.provider_token, userId);
      }
    }
    
    // Determine redirect path
    const returnUrl = requestUrl.searchParams.get('returnUrl');
    let redirectPath = '/dashboard';
    
    if (returnUrl) {
      const decodedUrl = decodeURIComponent(returnUrl);
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
        redirectPath = decodedUrl;
      }
    }

    const res = NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
    return res;
  }

  // Fallback redirect if no session data
  const returnUrl = requestUrl.searchParams.get('returnUrl');
  let redirectPath = '/dashboard';
  
  if (returnUrl) {
    const decodedUrl = decodeURIComponent(returnUrl);
    if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
      redirectPath = decodedUrl;
    }
  }

  const res = NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
  res.headers.set("X-Callback-Canary", "CALLBACK_ROUTE_TS_V1437Z");
  return res;
}
