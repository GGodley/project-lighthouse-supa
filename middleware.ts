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
  const { pathname } = request.nextUrl;

  // Protect dashboard routes - redirect to login if not authenticated
  // Supabase SSR automatically handles token refresh, so if getUser() returns null,
  // it means the token is expired and can't be refreshed
  if (!user && pathname.startsWith('/dashboard')) {
    // Preserve returnUrl for post-login redirect
    const returnUrl = pathname !== '/dashboard' ? encodeURIComponent(pathname) : undefined;
    const loginUrl = returnUrl 
      ? `/login?returnUrl=${returnUrl}`
      : '/login';
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  // Redirect authenticated users away from login page and home page
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Redirect authenticated users from home page to dashboard
  // Allow unauthenticated users to access home page
  if (user && pathname === '/') {
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
