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
    console.error('OAuth error:', error, error_description);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  // Handle missing code
  if (!code) {
    console.error('No authorization code in callback');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=No authorization code provided`
    );
  }

  // Create redirect response - standard Supabase SSR pattern
  const redirectUrl = `${requestUrl.origin}/dashboard`;
  const response = NextResponse.redirect(redirectUrl);

  // Create Supabase client with cookie handlers - standard SSR pattern
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

  // Exchange code for session - standard Supabase SSR pattern
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('Error exchanging code for session:', exchangeError);
    
    // Check if user is already authenticated (code might have been used)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // User is authenticated, redirect to dashboard
      return response;
    }
    
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Verify session was created
  if (!data.session) {
    console.error('No session in exchange response');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Session not created`
    );
  }

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

  // Redirect to dashboard - response already has cookies set
  return response;
}
