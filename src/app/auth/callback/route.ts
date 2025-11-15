import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error_description = requestUrl.searchParams.get('error_description');
  const error = requestUrl.searchParams.get('error');

  // ============================================
  // COMPREHENSIVE LOGGING - AUTH CALLBACK START
  // ============================================
  console.log('========================================');
  console.log('🔐 AUTH CALLBACK ROUTE HANDLER STARTED');
  console.log('========================================');
  console.log('📋 Request Details:');
  console.log('  - Full URL:', request.url);
  console.log('  - Origin:', requestUrl.origin);
  console.log('  - Pathname:', requestUrl.pathname);
  console.log('  - Search Params:', requestUrl.search);
  console.log('  - Code present:', !!code);
  console.log('  - Code value:', code ? `${code.substring(0, 20)}...` : 'NONE');
  console.log('  - Error param:', error);
  console.log('  - Error description:', error_description);

  // Log ALL cookies received
  const allCookies = request.cookies.getAll();
  console.log('🍪 Cookie Analysis:');
  console.log('  - Total cookies:', allCookies.length);
  console.log('  - All cookie names:', allCookies.map(c => c.name).join(', '));
  
  // Look for code verifier specifically
  const codeVerifierCookies = allCookies.filter(c => 
    c.name.toLowerCase().includes('verifier') || 
    c.name.toLowerCase().includes('code') ||
    c.name.startsWith('sb-')
  );
  console.log('  - Code verifier related cookies:', codeVerifierCookies.length);
  codeVerifierCookies.forEach(c => {
    console.log(`    * ${c.name}: ${c.value.substring(0, 30)}... (length: ${c.value.length})`);
  });

  // Check for Supabase auth cookies
  const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
  console.log('  - Supabase cookies (sb-*):', supabaseCookies.length);
  supabaseCookies.forEach(c => {
    console.log(`    * ${c.name}: ${c.value.substring(0, 30)}...`);
  });

  // ============================================
  // ERROR HANDLING - Check for OAuth errors first
  // ============================================
  if (error) {
    console.error('❌ OAuth Error in callback URL:');
    console.error('  - Error:', error);
    console.error('  - Description:', error_description);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (!code) {
    console.error('❌ No authorization code in callback URL');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=No authorization code provided`
    );
  }

  // ============================================
  // CREATE RESPONSE - Must be created before Supabase client
  // ============================================
  console.log('📤 Creating redirect response...');
  const redirectUrl = `${requestUrl.origin}/dashboard`;
  const response = NextResponse.redirect(redirectUrl);
  console.log('  - Redirect URL:', redirectUrl);

  // ============================================
  // CREATE SUPABASE CLIENT - Standard SSR Pattern
  // ============================================
  console.log('🔧 Creating Supabase server client...');
  console.log('  - Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('  - Anon Key present:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies = request.cookies.getAll();
          console.log('  📥 Cookie getAll() called - returning', cookies.length, 'cookies');
          return cookies;
        },
        setAll(cookiesToSet) {
          console.log('  📤 Cookie setAll() called - setting', cookiesToSet.length, 'cookies');
          cookiesToSet.forEach(({ name, value, options }) => {
            console.log(`    - Setting cookie: ${name} (value length: ${value.length})`);
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // ============================================
  // CHECK IF USER IS ALREADY AUTHENTICATED FIRST
  // Supabase may have already processed the callback
  // ============================================
  console.log('🔍 Checking if user is already authenticated...');
  const { data: { user: existingUser }, error: getUserError } = await supabase.auth.getUser();
  const { data: { session: existingSession } } = await supabase.auth.getSession();
  
  console.log('  - Existing user found:', !!existingUser);
  console.log('  - Existing session found:', !!existingSession);
  
  if (existingUser && existingSession) {
    console.log('✅ User already authenticated - Supabase processed callback successfully');
    console.log('  - User ID:', existingUser.id);
    console.log('  - User email:', existingUser.email);
    
    // Still create profile if needed
    if (existingUser) {
      console.log('👤 Creating/checking profile for user:', existingUser.id);
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', existingUser.id)
          .maybeSingle();
        
        if (!existingProfile) {
          console.log('  - Profile not found, creating...');
          const provider = existingUser.app_metadata?.provider || 'google';
          const providerId = existingUser.app_metadata?.provider_id || 
                            existingUser.user_metadata?.provider_id || 
                            existingUser.email || '';
          const fullName = existingUser.user_metadata?.full_name || 
                          existingUser.user_metadata?.name || 
                          null;
          
          await supabase
            .from('profiles')
            .insert({
              id: existingUser.id,
              email: existingUser.email || '',
              full_name: fullName,
              provider: provider,
              provider_id: providerId,
            });
          console.log('  - Profile created successfully');
        } else {
          console.log('  - Profile already exists');
        }
      } catch (profileError) {
        console.error('  - Profile creation exception:', profileError);
      }
    }
    
    console.log('✅ Redirecting to dashboard (user already authenticated)');
    return response;
  }

  // ============================================
  // EXCHANGE CODE FOR SESSION
  // Only if user is not already authenticated
  // ============================================
  console.log('🔄 User not authenticated yet - attempting to exchange code for session...');
  console.log('  - Code length:', code.length);
  console.log('  - Code first 20 chars:', code.substring(0, 20));
  
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
    
    // Check if user is authenticated despite error (code might have been used)
    console.log('🔍 Checking if session exists despite error...');
    const { data: sessionCheck } = await supabase.auth.getSession();
    const { data: { user: userCheck } } = await supabase.auth.getUser();
    
    console.log('  - Session exists:', !!sessionCheck?.session);
    console.log('  - User exists:', !!userCheck);
    
    if (sessionCheck?.session || userCheck) {
      console.log('✅ Session/user found despite exchange error - redirecting to dashboard');
      return response;
    }
    
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // ============================================
  // SUCCESS - Session Created
  // ============================================
  console.log('✅ Code exchange successful!');
  console.log('📊 Session Data:');
  console.log('  - Session exists:', !!data.session);
  console.log('  - User ID:', data.user?.id);
  console.log('  - User email:', data.user?.email);
  console.log('  - Provider:', data.user?.app_metadata?.provider);
  console.log('  - Access token present:', !!data.session?.access_token);
  console.log('  - Refresh token present:', !!data.session?.refresh_token);
  console.log('  - Provider token present:', !!data.session?.provider_token);

  if (!data.session) {
    console.error('❌ No session in exchange response!');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Session not created`
    );
  }

  // ============================================
  // VERIFY SESSION IS SET
  // ============================================
  console.log('🔍 Verifying session is properly set...');
  const { data: verifySession } = await supabase.auth.getSession();
  const { data: { user: verifyUser } } = await supabase.auth.getUser();
  
  console.log('  - Verified session exists:', !!verifySession?.session);
  console.log('  - Verified user exists:', !!verifyUser);
  
  if (!verifySession?.session && !verifyUser) {
    console.error('❌ Session verification failed - no session or user found');
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Session verification failed`
    );
  }

  // ============================================
  // CREATE PROFILE IF NEEDED
  // ============================================
  if (data.user) {
    console.log('👤 Creating/checking profile for user:', data.user.id);
    try {
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('  - Profile check error:', profileError);
      }
      
      if (!existingProfile) {
        console.log('  - Profile not found, creating...');
        const provider = data.user.app_metadata?.provider || 'google';
        const providerId = data.user.app_metadata?.provider_id || 
                          data.user.user_metadata?.provider_id || 
                          data.user.email || '';
        const fullName = data.user.user_metadata?.full_name || 
                        data.user.user_metadata?.name || 
                        null;
        
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email || '',
            full_name: fullName,
            provider: provider,
            provider_id: providerId,
          });
        
        if (createError) {
          console.error('  - Profile creation error:', createError);
        } else {
          console.log('  - Profile created successfully');
        }
      } else {
        console.log('  - Profile already exists');
      }
    } catch (profileError) {
      console.error('  - Profile creation exception:', profileError);
    }
  }

  // ============================================
  // FINAL CHECKS AND REDIRECT
  // ============================================
  console.log('📋 Final Response Details:');
  const responseCookies = response.cookies.getAll();
  console.log('  - Cookies in response:', responseCookies.length);
  responseCookies.forEach(c => {
    console.log(`    * ${c.name}: ${c.value.substring(0, 30)}...`);
  });
  console.log('  - Redirect location:', response.headers.get('location'));
  
  console.log('✅ Redirecting to dashboard');
  console.log('========================================');
  console.log('🔐 AUTH CALLBACK COMPLETE');
  console.log('========================================');
  
  return response;
}

