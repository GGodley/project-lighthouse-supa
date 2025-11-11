//
// ⚠️ THIS IS THE DEFINITIVE DIAGNOSTIC middleware.ts FILE (v2 - Corrected) ⚠️
//
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log(`--- [Middleware] Request received for: ${request.nextUrl.pathname} ---`);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // --- DIAGNOSTIC LOG 1: Check for the Supabase auth cookie ---
  // ✅ CORRECTED LOGIC: Get all cookies and find the one that starts with 'sb-'
  const allCookies = request.cookies.getAll();
  const authCookie = allCookies.find((cookie) => cookie.name.startsWith('sb-'));
  
  console.log('[Middleware Cookie Check] Supabase auth cookie found in request:', !!authCookie);
  if (!authCookie) {
    console.warn('[Middleware Cookie Check] WARNING: No Supabase auth cookie was found in the incoming request.');
  } else {
    console.log('[Middleware Cookie Check] Found cookie name:', authCookie.name);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // --- DIAGNOSTIC LOG 2: Check the result of getUser() ---
  console.log('[Middleware Auth Check] Attempting to get user from session...');
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
      console.error('[Middleware Auth Check] ERROR getting user:', userError.message);
  }
  console.log('[Middleware Auth Check] supabase.auth.getUser() returned a user object:', !!user);
  if (user) {
      console.log('[Middleware Auth Check] User ID:', user.id);
  }

  const { pathname } = request.nextUrl;
  const searchParams = request.nextUrl.searchParams;
  
  // Check if this is a redirect from auth callback (has auth=success param)
  const isAuthCallbackRedirect = searchParams.get('auth') === 'success';

  // --- REDIRECT LOGIC ---
  // If coming from auth callback but no user found yet, check cookies more carefully
  // This handles the race condition where cookies might not be fully propagated
  if (!user && pathname.startsWith('/dashboard')) {
    // If this is from auth callback, allow it through - cookies might still be setting
    if (isAuthCallbackRedirect) {
      console.log(`[Middleware Decision] Auth callback redirect detected. Allowing through even without user (cookies may still be setting).`);
      return response;
    }
    console.log(`[Middleware Decision] No user found. Redirecting from protected route ${pathname} to /login.`);
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Don't redirect authenticated users away from login if they just came from auth callback
  // This prevents a redirect loop
  if (user && (pathname === '/login' || pathname === '/')) {
    // If they have auth=success param, they're already being redirected, don't double redirect
    if (isAuthCallbackRedirect && pathname === '/login') {
      console.log(`[Middleware Decision] User logged in and on login page with auth=success. Redirecting to dashboard.`);
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    console.log(`[Middleware Decision] User is logged in. Redirecting from ${pathname} to /dashboard.`);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  console.log(`[Middleware Decision] No redirect needed for path: ${pathname}. Proceeding.`);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/callback (the Supabase auth callback route)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback).*)',
  ],
}