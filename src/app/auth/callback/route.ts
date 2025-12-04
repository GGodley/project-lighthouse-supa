export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
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
      `${requestUrl.origin}/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  // Handle missing code
  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=No authorization code provided`
    );
  }

  // Check for returnUrl in query params (preserved from login redirect)
  const returnUrl = requestUrl.searchParams.get('returnUrl');
  
  // Validate returnUrl to prevent open redirects
  let redirectPath = '/dashboard'; // Default destination
  
  if (returnUrl) {
    try {
      const decodedUrl = decodeURIComponent(returnUrl);
      
      // Validate it's a safe same-origin path
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
        // Ensure it's not an auth page (prevent loops)
        if (!decodedUrl.startsWith('/login') && !decodedUrl.startsWith('/auth')) {
          redirectPath = decodedUrl;
        }
      }
    } catch (error) {
      console.error('Invalid returnUrl:', error);
      // Fall back to default dashboard
    }
  }

  // Create redirect response - standard Supabase SSR pattern for route handlers
  const redirectUrl = `${requestUrl.origin}${redirectPath}`;
  const response = NextResponse.redirect(redirectUrl);

  // Create Supabase client with request/response cookie handlers - CORRECT for route handlers
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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Exchange code for session
  // Note: Supabase SSR should automatically handle PKCE code verifier from cookies
  // If the code verifier is missing, it might be because:
  // 1. The OAuth flow was initiated on a different domain/subdomain
  // 2. Cookies were cleared between OAuth initiation and callback
  // 3. There's a cookie domain/path mismatch
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  
  // Log the error for debugging if exchange fails
  if (exchangeError) {
    console.error('Auth callback exchange error:', {
      message: exchangeError.message,
      status: exchangeError.status,
      code: code ? 'present' : 'missing',
      // Check if code verifier cookie exists
      hasCodeVerifierCookie: request.cookies.getAll().some(c => 
        c.name.includes('code-verifier') || c.name.includes('pkce')
      )
    });
  }

  if (exchangeError) {
    // Check if user is already authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return response;
    }
    
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Verify session was created
  if (!data.session) {
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Session not created`
    );
  }

  // Log session details for debugging
  console.log('Auth callback: Session created successfully', {
    hasUser: !!data.user,
    hasEmail: !!data.user?.email,
    hasProviderToken: !!data.session.provider_token,
    providerTokenLength: data.session.provider_token?.length || 0,
    accessTokenExists: !!data.session.access_token,
    refreshTokenExists: !!data.session.refresh_token
  })

  // Create profile if it doesn't exist
  if (data.user) {
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      
      if (!existingProfile) {
        const provider = data.user.app_metadata?.provider || 'google';
        const providerId = data.user.app_metadata?.provider_id || 
                          data.user.user_metadata?.provider_id || 
                          data.user.email || '';
        const fullName = data.user.user_metadata?.full_name || 
                        data.user.user_metadata?.name || 
                        null;
        
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email || '',
            full_name: fullName,
            provider: provider,
            provider_id: providerId,
          });
      }
    } catch (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't fail auth if profile creation fails
    }
  }

  return response;
}
