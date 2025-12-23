export const dynamic = 'force-dynamic';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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
  
  if (existingUser) {
    // User is already authenticated, skip code exchange but still update tokens if available
    console.log('User already authenticated, skipping code exchange');
    
    // Try to get session and update tokens if available
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession?.provider_refresh_token || existingSession?.provider_token) {
      try {
        await supabase
          .from('profiles')
          .update({
            gmail_refresh_token: existingSession.provider_refresh_token || null,
            gmail_access_token: existingSession.provider_token || null,
          })
          .eq('id', existingUser.id);
        console.log('✅ Updated tokens for existing user:', existingUser.id);
      } catch (error) {
        console.error('Failed to update tokens for existing user:', error);
        // Don't fail auth flow
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
      
      // Try to update tokens even after error
      const { data: { session: errorSession } } = await supabase.auth.getSession();
      if (errorSession?.provider_refresh_token || errorSession?.provider_token) {
        try {
          await supabase
            .from('profiles')
            .update({
              gmail_refresh_token: errorSession.provider_refresh_token || null,
              gmail_access_token: errorSession.provider_token || null,
            })
            .eq('id', userAfterError.id);
          console.log('✅ Updated tokens after error recovery:', userAfterError.id);
        } catch (error) {
          console.error('Failed to update tokens after error:', error);
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
      
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    }
    
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // ✅ Successfully exchanged code for session - now store refresh token
  if (data?.session) {
    const userId = data.session.user.id;
    let refreshToken = data.session.provider_refresh_token;
    let accessToken = data.session.provider_token;

    // If refresh token not in session, try to get it from user's identity data using Admin API
    if (!refreshToken) {
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (!userError && userData?.user) {
          // Find Google identity
          const googleIdentity = userData.user.identities?.find(
            (identity) => identity.provider === 'google'
          );
          
          // Get refresh token from identity_data
          const identityRefreshToken = googleIdentity?.identity_data?.provider_refresh_token as string | undefined;
          
          if (identityRefreshToken) {
            refreshToken = identityRefreshToken;
            console.log('✅ Found refresh token in user identity data');
          }
          
          // Also try to get access token if not in session
          if (!accessToken) {
            const identityAccessToken = googleIdentity?.identity_data?.provider_token as string | undefined;
            if (identityAccessToken) {
              accessToken = identityAccessToken;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user identity data:', error);
        // Continue with what we have from session
      }
    }

    // Store tokens in profiles table if available
    if (refreshToken || accessToken) {
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            gmail_refresh_token: refreshToken || null,
            gmail_access_token: accessToken || null,
          })
          .eq('id', userId);

        if (updateError) {
          console.error('Failed to store refresh token in profiles:', updateError);
          // Don't fail auth flow - tokens might be stored in Supabase's identity data
        } else {
          console.log('✅ Successfully stored tokens for user:', userId, {
            hasRefreshToken: !!refreshToken,
            hasAccessToken: !!accessToken,
            source: refreshToken ? (data.session.provider_refresh_token ? 'session' : 'identity_data') : 'none',
          });
        }
      } catch (error) {
        console.error('Error storing tokens in profiles:', error);
        // Don't fail auth flow - graceful degradation
      }
    } else {
      console.warn('⚠️ No refresh token or access token found after OAuth exchange');
      console.warn('Session data:', {
        hasProviderToken: !!data.session.provider_token,
        hasProviderRefreshToken: !!data.session.provider_refresh_token,
        provider: data.session.user.app_metadata?.provider,
        userId: userId,
      });
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
  
  // ⚡ CRITICAL: Use the redirect method that preserves the cookies set by the client
  return NextResponse.redirect(redirectUrl);
}
