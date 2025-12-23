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
    
    const returnUrl = requestUrl.searchParams.get('returnUrl');
    let redirectPath = '/dashboard';
    
    if (returnUrl) {
      const decodedUrl = decodeURIComponent(returnUrl);
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//') && !decodedUrl.startsWith('/auth')) {
        redirectPath = decodedUrl;
      }
    }
    
    // Create redirect response first
    const response = NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    
    // Attach cookie directly to the response if provider_token is available
    if (existingSession?.provider_token) {
      response.cookies.set('google_access_token', existingSession.provider_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      console.log('🍪 Saved Google access token to secure cookie (existing session)');
    }
    
    return response;
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
    const { data: { session: sessionAfterError } } = await supabase.auth.getSession();
    
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
      
      // Create redirect response first
      const response = NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
      
      // Attach cookie directly to response if available
      if (sessionAfterError?.provider_token) {
        response.cookies.set('google_access_token', sessionAfterError.provider_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600,
          path: '/',
        });
        console.log('🍪 Saved Google access token to secure cookie (error recovery path)');
      }
      
      return response;
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:139',message:'After exchangeCodeForSession - checking data object structure',data:{hasData:!!data,hasSession:!!data.session,dataKeys:data?Object.keys(data):[],sessionKeys:data.session?Object.keys(data.session):[],hasProviderToken:!!data.session?.provider_token,hasProviderRefreshToken:!!data.session?.provider_refresh_token,hasAccessToken:!!data.session?.access_token,hasRefreshToken:!!data.session?.refresh_token,userId:userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Save provider_token to secure HTTP-only cookie (Cookie Backpack pattern)
    // Check both provider_token and provider_refresh_token in the session
    let providerToken = data.session.provider_token;
    const providerRefreshToken = data.session.provider_refresh_token;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:147',message:'Checking for provider tokens in OAuth response',data:{hasProviderToken:!!providerToken,hasProviderRefreshToken:!!providerRefreshToken,providerTokenLength:providerToken?.length,providerRefreshTokenLength:providerRefreshToken?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:145',message:'Provider token check from data.session',data:{hasProviderToken:!!providerToken,providerTokenLength:providerToken?.length,providerTokenPrefix:providerToken?.substring(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:158',message:'Fresh session check for provider_token',data:{hasFreshSession:!!freshSession,hasProviderToken:!!freshSession?.provider_token,hasProviderRefreshToken:!!freshSession?.provider_refresh_token,freshSessionKeys:freshSession?Object.keys(freshSession):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (freshSession?.provider_token) {
        providerToken = freshSession.provider_token;
        console.log('✅ Found provider_token in fresh session');
      } else if (providerRefreshToken) {
        // If we have refresh token but no access token, try to get a fresh access token from Google
        console.log('🔄 Have refresh token but no access token, fetching from Google...');
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:168',message:'Attempting to refresh access token from Google',data:{hasRefreshToken:!!providerRefreshToken,refreshTokenLength:providerRefreshToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        try {
          const googleClientId = process.env.GOOGLE_CLIENT_ID;
          const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (googleClientId && googleClientSecret) {
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: googleClientId,
                client_secret: googleClientSecret,
                refresh_token: providerRefreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              const refreshedToken = tokenData.access_token;
              
              if (refreshedToken) {
                providerToken = refreshedToken;
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:204',message:'Successfully refreshed access token from Google',data:{hasAccessToken:!!refreshedToken,accessTokenLength:refreshedToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                console.log('✅ Refreshed access token from Google');
              } else {
                console.error('❌ Token refresh response missing access_token');
              }
            } else {
              const errorText = await tokenResponse.text();
              console.error('❌ Failed to refresh token:', errorText);
            }
          }
        } catch (error) {
          console.error('❌ Error refreshing token:', error);
        }
      } else {
        console.warn('⚠️ provider_token not found in session. This may indicate the token needs to be refreshed.');
        console.warn('⚠️ The user may need to use the sync button which will trigger a token refresh.');
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

    // Create redirect response FIRST
    const redirectUrl = `${requestUrl.origin}${redirectPath}`;
    const response = NextResponse.redirect(redirectUrl);
    
    // Attach cookie DIRECTLY to the response object
    // This guarantees the 'Set-Cookie' header is sent to the browser
    if (providerToken) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:229',message:'Attaching cookie directly to redirect response',data:{hasProviderToken:!!providerToken,providerTokenLength:providerToken.length,nodeEnv:process.env.NODE_ENV},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      response.cookies.set('google_access_token', providerToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      
      console.log('✅ Google Token attached to Redirect Response');
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:244',message:'Provider token not available - cannot set cookie',data:{sessionExists:!!data.session,sessionKeys:data.session?Object.keys(data.session):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.error('❌ Could not set cookie: provider_token not available');
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/callback/route.ts:253',message:'Final redirect response - cookies in response',data:{responseCookieNames:Array.from(response.cookies.getAll().map(c=>c.name)),hasGoogleTokenCookie:response.cookies.has('google_access_token')},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    return response;
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

  return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
}
