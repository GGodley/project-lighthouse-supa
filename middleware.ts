//
// ⚠️ THIS IS THE DEFINITIVE DIAGNOSTIC middleware.ts FILE ⚠️
//
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log(`--- [Middleware] Request received for: ${request.nextUrl.pathname} ---`);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // --- DIAGNOSTIC LOG 1: Check for the Supabase auth cookie ---
  const authCookie = request.cookies.get((key: string) => key.startsWith('sb-'));
  console.log('[Middleware Cookie Check] Supabase auth cookie found in request:', !!authCookie);
  if (!authCookie) {
    console.warn('[Middleware Cookie Check] WARNING: No Supabase auth cookie was found in the incoming request.');
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

  // --- REDIRECT LOGIC ---
  if (!user && pathname.startsWith('/dashboard')) {
    console.log(`[Middleware Decision] No user found. Redirecting from protected route ${pathname} to /login.`);
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  if (user && (pathname === '/login' || pathname === '/')) {
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