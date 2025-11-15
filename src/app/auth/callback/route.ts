export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // ============================================
  // COMPREHENSIVE LOGGING - START
  // ============================================
  console.log('========================================');
  console.log('🔐 AUTH CALLBACK ROUTE - START');
  console.log('========================================');
  console.log('📋 Request Details:');
  console.log('  - Full URL:', request.url);
  console.log('  - Origin:', requestUrl.origin);
  console.log('  - Pathname:', requestUrl.pathname);
  console.log('  - Code present:', !!code);
  console.log('  - Code value:', code ? `${code.substring(0, 30)}...` : 'NULL');
  console.log('  - Code length:', code?.length || 0);
  console.log('  - Error param:', error);
  console.log('  - Error description:', error_description);

  // Log ALL cookies received - for debugging authentication flow
  const allCookies = request.cookies.getAll();
  console.log('🍪 Cookie Analysis:');
  console.log('  - Total cookies received:', allCookies.length);
  console.log('  - All cookie names:', allCookies.map(c => c.name).join(', ') || 'NONE');
  
  // Check for Supabase cookies specifically
  const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
  console.log('  - Supabase cookies (sb-*):', supabaseCookies.length);
  supabaseCookies.forEach(c => {
    console.log(`    * ${c.name}: ${c.value.substring(0, 50)}... (length: ${c.value.length})`);
  });
  
  // CRITICAL: Check for code verifier cookie - this is what Supabase needs
  const codeVerifierCookies = allCookies.filter(c => 
    c.name.includes('code-verifier') || 
    c.name.includes('verifier') ||
    c.name.includes('auth-token')
  );
  console.log('  - Code verifier related cookies:', codeVerifierCookies.length);
  if (codeVerifierCookies.length === 0) {
    console.error('  ❌ CRITICAL: No code verifier cookie found!');
    console.error('  - This means the cookie was not set by signInWithOAuth');
    console.error('  - Or the cookie is not being sent with the request');
    console.error('  - Cookie domain/path might be incorrect');
  } else {
    codeVerifierCookies.forEach(c => {
      console.log(`    * ${c.name}: ${c.value.substring(0, 50)}... (length: ${c.value.length})`);
    });
  }
  
  // Log request headers to see if cookies are being sent
  const cookieHeader = request.headers.get('cookie');
  console.log('  - Cookie header present:', !!cookieHeader);
  console.log('  - Cookie header length:', cookieHeader?.length || 0);

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth error in callback:', error, error_description);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  // Handle missing code
  if (!code) {
    console.error('❌ No authorization code in callback URL');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=No authorization code provided`
    );
  }

  // ============================================
  // CREATE RESPONSE AND SUPABASE CLIENT
  // ============================================
  console.log('📤 Creating redirect response to dashboard...');
  const redirectUrl = `${requestUrl.origin}/dashboard`;
  const response = NextResponse.redirect(redirectUrl);
  console.log('  - Redirect URL:', redirectUrl);

  console.log('🔧 Creating Supabase server client...');
  console.log('  - Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('  - Anon Key present:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  // ============================================
  // EXCHANGE CODE FOR SESSION
  // ============================================
  console.log('🔄 Attempting to exchange code for session...');
  console.log('  - Code to exchange:', code.substring(0, 30) + '...');
  console.log('  - Code length:', code.length);
  
  const exchangeStartTime = Date.now();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  const exchangeDuration = Date.now() - exchangeStartTime;
  
  console.log('  - Exchange completed in', exchangeDuration, 'ms');

  if (exchangeError) {
    console.error('❌ EXCHANGE ERROR:');
    console.error('  - Error message:', exchangeError.message);
    console.error('  - Error name:', exchangeError.name);
    console.error('  - Error status:', exchangeError.status);
    console.error('  - Full error:', JSON.stringify(exchangeError, null, 2));
    
    // Check if user is already authenticated (code might have been used)
    console.log('🔍 Checking if user is already authenticated...');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      console.log('✅ User is authenticated despite exchange error - redirecting to dashboard');
      return response;
    }
    
    console.error('❌ User not authenticated - redirecting to login with error');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // ============================================
  // VERIFY SESSION WAS CREATED
  // ============================================
  console.log('✅ Code exchange successful!');
  console.log('📊 Session Data:');
  console.log('  - Session exists:', !!data.session);
  console.log('  - User ID:', data.user?.id);
  console.log('  - User email:', data.user?.email);
  console.log('  - Provider:', data.user?.app_metadata?.provider);

  if (!data.session) {
    console.error('❌ No session in exchange response');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Session not created`
    );
  }

  // ============================================
  // CREATE PROFILE IF NEEDED
  // ============================================
  if (data.user) {
    console.log('👤 Creating/checking profile for user:', data.user.id);
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      
      if (!existingProfile) {
        console.log('  - Profile not found, creating...');
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
        console.log('  - Profile created successfully');
      } else {
        console.log('  - Profile already exists');
      }
    } catch (profileError) {
      console.error('  - Profile creation error:', profileError);
      // Don't fail auth if profile creation fails
    }
  }

  // ============================================
  // FINAL REDIRECT
  // ============================================
  console.log('✅ Redirecting to dashboard');
  console.log('  - Response cookies:', response.cookies.getAll().length);
  console.log('========================================');
  console.log('🔐 AUTH CALLBACK ROUTE - COMPLETE');
  console.log('========================================');
  
  return response;
}
