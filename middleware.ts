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

  // Check if user has valid authentication with provider_token and email
  // Note: We allow users without provider_token to access dashboard - client-side components will handle redirect
  const hasValidAuth = user && session?.provider_token && session?.user?.email;

  // Protect dashboard routes - redirect to login if not authenticated
  // Note: We don't check for provider_token here - let client-side handle that to avoid redirect loops
  if (!user && pathname.startsWith('/dashboard')) {
    // Preserve returnUrl for post-login redirect
    const returnUrl = pathname !== '/dashboard' ? encodeURIComponent(pathname) : undefined;
    const loginUrl = returnUrl 
      ? `/login?returnUrl=${returnUrl}`
      : '/login';
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  // Redirect authenticated users (with valid credentials) away from login page
  // Only redirect if user has both provider_token and email (fully authenticated)
  if (hasValidAuth && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Redirect authenticated users from home page to dashboard
  // Only redirect if user has valid credentials
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
