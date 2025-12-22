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

  // Handle missing code
  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent('No authorization code provided')}`
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

  // Get the cookie store from Next.js
  const cookieStore = await cookies();

  // Create Supabase client with proper cookie handling
  // CRUCIAL: The get method must return cookieStore.get(name)?.value
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
            // The `set` method was called from a Route Handler.
            // This can be ignored if you have middleware refreshing
            // user sessions, or you can handle the error appropriately.
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

  // Exchange code for session
  // This will automatically use the code verifier from cookies
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  
  // Log the error for debugging if exchange fails
  if (exchangeError) {
    console.error('Auth callback exchange error:', {
      message: exchangeError.message,
      status: exchangeError.status,
      code: code ? 'present' : 'missing',
      // Check if code verifier cookie exists
      codeVerifierCookie: cookieStore.get('sb-code-verifier')?.value ? 'present' : 'missing',
      allCookies: cookieStore.getAll().map(c => c.name),
    });
    
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Verify session was created
  if (!data.session) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent('Session not created')}`
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
  });

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

  // Create redirect response
  const redirectUrl = `${requestUrl.origin}${redirectPath}`;
  return NextResponse.redirect(redirectUrl);
}
