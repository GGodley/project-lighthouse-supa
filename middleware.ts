import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Standard Supabase SSR pattern for middleware - use getAll/setAll
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const { pathname } = request.nextUrl;

  // Check if user has valid authentication (user exists AND has provider_token and email)
  // A user without provider_token or email needs to re-authenticate
  const hasValidAuth = user && session?.provider_token && session?.user?.email;

  // Protect dashboard routes - redirect to login if not authenticated or missing credentials
  if ((!user || !hasValidAuth) && pathname.startsWith('/dashboard')) {
    // Preserve returnUrl for post-login redirect
    const returnUrl = pathname !== '/dashboard' ? encodeURIComponent(pathname) : undefined;
    const loginUrl = returnUrl 
      ? `/login?returnUrl=${returnUrl}`
      : '/login';
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  // Redirect authenticated users (with valid credentials) away from login page and home page
  // Don't redirect if user is missing provider_token or email (they need to re-authenticate)
  if (hasValidAuth && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Redirect authenticated users from home page to dashboard
  // Allow unauthenticated users to access home page
  if (hasValidAuth && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

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
};
