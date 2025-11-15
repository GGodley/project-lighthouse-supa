import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
  console.log('  - All cookie names:', allCookies.map(c => c.name).join(', '));
  
  // Check for Supabase cookies specifically
  const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
  console.log('  - Supabase cookies (sb-*):', supabaseCookies.length);
  supabaseCookies.forEach(c => {
    console.log(`    * ${c.name}: ${c.value.substring(0, 50)}... (length: ${c.value.length})`);
  });

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

  // Track cookie operations
  let cookieGetAllCallCount = 0;
  let cookieSetAllCallCount = 0;
  const cookiesSet: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          cookieGetAllCallCount++;
          const cookies = request.cookies.getAll();
          console.log(`  📥 Cookie getAll() called (${cookieGetAllCallCount}x) - returning ${cookies.length} cookies`);
          if (cookieGetAllCallCount === 1) {
            // Log cookies on first call
            cookies.forEach(c => {
              if (c.name.startsWith('sb-')) {
                console.log(`    - Cookie: ${c.name} (length: ${c.value.length})`);
              }
            });
          }
          return cookies;
        },
        setAll(cookiesToSet) {
          cookieSetAllCallCount++;
          console.log(`  📤 Cookie setAll() called (${cookieSetAllCallCount}x) - setting ${cookiesToSet.length} cookies`);
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesSet.push(name);
            console.log(`    - Setting cookie: ${name} (value length: ${value.length}, path: ${options?.path || 'default'}, domain: ${options?.domain || 'default'})`);
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
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
  console.log('  - Cookie getAll() was called', cookieGetAllCallCount, 'times');
  console.log('  - Cookie setAll() was called', cookieSetAllCallCount, 'times');
  console.log('  - Cookies set:', cookiesSet.join(', '));

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
