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

  // Check for authentication errors that indicate expired or invalid tokens
  // Common error messages: "JWT expired", "Invalid JWT", "refresh_token_not_found"
  const isTokenExpiredError = authError && (
    authError.message?.toLowerCase().includes('expired') ||
    authError.message?.toLowerCase().includes('invalid jwt') ||
    authError.message?.toLowerCase().includes('refresh_token')
  );

  // Also check session expiration if available
  let isSessionExpired = false;
  if (!isTokenExpiredError && !authError) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000); // expires_at is in seconds
        const now = new Date();
        // If expired or expiring within 1 minute, treat as expired
        isSessionExpired = expiresAt.getTime() - now.getTime() <= 60 * 1000;
      }
    } catch (error) {
      // If we can't check the session, assume it might be expired
      console.error('Error checking session expiration in middleware:', error);
    }
  }

  // Protect dashboard routes - redirect to login if not authenticated or token expired
  // Supabase SSR automatically handles token refresh, so if getUser() returns null,
  // or if there's an auth error indicating expired token, redirect to login
  if ((!user || isTokenExpiredError || isSessionExpired) && pathname.startsWith('/dashboard')) {
    // Preserve returnUrl for post-login redirect
    const returnUrl = pathname !== '/dashboard' ? encodeURIComponent(pathname) : undefined;
    const loginUrl = returnUrl 
      ? `/login?returnUrl=${returnUrl}`
      : '/login';
    
    // Log the reason for redirect for debugging
    if (isTokenExpiredError) {
      console.log('🔄 Middleware: Token expired error detected, redirecting to login');
    } else if (isSessionExpired) {
      console.log('🔄 Middleware: Session expired, redirecting to login');
    } else if (!user) {
      console.log('🔄 Middleware: No user found, redirecting to login');
    }
    
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
