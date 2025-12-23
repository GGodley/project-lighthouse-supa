export const dynamic = 'force-dynamic';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent('No authorization code provided')}`
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            console.error('Error setting cookie:', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            console.error('Error removing cookie:', error);
          }
        },
      },
    }
  );

  // Check if user is already authenticated before attempting exchange
  const { data: { user: existingUser } } = await supabase.auth.getUser();
  const { data: { session: existingSession } } = await supabase.auth.getSession();
  
  if (existingUser) {
    // User is already authenticated, skip code exchange
    console.log('User already authenticated, skipping code exchange');
    
    // Still set the cookie if provider_token is available in the session
    if (existingSession?.provider_token) {
      cookieStore.set('google_access_token', existingSession.provider_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      console.log('🍪 Saved Google access token to secure cookie (existing session)');
    }
    
    const returnUrl = requestUrl.searchParams.get('returnUrl');
    let redirectPath = '/dashboard';
    
    if (returnUrl) {
      const decodedUrl = decodeURIComponent(returnUrl);
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
        redirectPath = decodedUrl;
      }
    }
    
    return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
  }

  // User is not authenticated, proceed with code exchange
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    // 🔍 DEBUGGING: Print ALL cookies to see what the server actually received
    const allCookies = cookieStore.getAll().map(c => c.name);
    
    // Check if we can find ANY verifier-like cookie
    const verifierCookies = allCookies.filter(name => name.includes('verifier') || name.includes('auth-token'));

    console.error('Auth Exchange Error Debug:', {
      message: exchangeError.message,
      receivedCookies: allCookies,
      verifierCandidates: verifierCookies,
      envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Defined' : 'MISSING',
      code: code ? 'present' : 'missing',
    });
    
    // Check if user became authenticated despite the error (race condition)
    const { data: { user: userAfterError } } = await supabase.auth.getUser();
    if (userAfterError) {
      console.log('User authenticated after exchange error, redirecting to dashboard');
      // Note: Tokens are stored securely in auth.identities by Supabase, not in profiles
      
      const returnUrl = requestUrl.searchParams.get('returnUrl');
      let redirectPath = '/dashboard';
      
      if (returnUrl) {
        const decodedUrl = decodeURIComponent(returnUrl);
        if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
          redirectPath = decodedUrl;
        }
      }
      
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    }
    
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // ✅ OAuth exchange successful - tokens are automatically stored in auth.identities by Supabase
  // PRODUCTION-READY: We do NOT store tokens in public.profiles to avoid RLS security risks
  // The edge function will read tokens directly from auth.identities (secure vault)
  if (data?.session) {
    const userId = data.session.user.id;
    console.log('✅ OAuth exchange successful for user:', userId);
    console.log('📝 Note: Refresh token is stored securely in auth.identities by Supabase');
    console.log('🔒 Edge functions will read tokens from auth.identities (not public.profiles)');

    // Save provider_token to secure HTTP-only cookie (Cookie Backpack pattern)
    let providerToken = data.session.provider_token;
    
    // Debug logging
    console.log('🔍 Session token check:', {
      hasProviderToken: !!providerToken,
      hasAccessToken: !!data.session.access_token,
      sessionKeys: Object.keys(data.session),
    });
    
    // If provider_token is not in session, try to get it from a fresh session check
    if (!providerToken) {
      console.log('⚠️ provider_token not in exchange session, checking fresh session...');
      // Get a fresh session - sometimes provider_token appears after a moment
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (freshSession?.provider_token) {
        providerToken = freshSession.provider_token;
        console.log('✅ Found provider_token in fresh session');
      } else {
        console.warn('⚠️ provider_token not found in session. This may indicate the token needs to be refreshed.');
        console.warn('⚠️ The user may need to use the sync button which will trigger a token refresh.');
      }
    }
    
    if (providerToken) {
      cookieStore.set('google_access_token', providerToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      console.log('🍪 Saved Google access token to secure cookie');
    } else {
      console.error('❌ Could not set cookie: provider_token not available');
    }
  }

  const returnUrl = requestUrl.searchParams.get('returnUrl');
  let redirectPath = '/dashboard';
  
  if (returnUrl) {
    const decodedUrl = decodeURIComponent(returnUrl);
    if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
      redirectPath = decodedUrl;
    }
  }

  // Create redirect response
  const redirectUrl = `${requestUrl.origin}${redirectPath}`;
  
  // Create redirect response and ensure cookies are included
  const response = NextResponse.redirect(redirectUrl);
  
  // Ensure any cookies we set are included in the response
  // The cookieStore.set() calls above should have already set them, but we verify here
  const allCookies = cookieStore.getAll();
  allCookies.forEach(cookie => {
    if (cookie.name === 'google_access_token') {
      response.cookies.set(cookie.name, cookie.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600,
        path: '/',
      });
    }
  });
  
  return response;
}
