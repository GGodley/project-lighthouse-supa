'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSupabase } from '@/components/SupabaseProvider'
import { getAuthCallbackURL } from '@/lib/utils'

export default function AuthForm() {
  const [loading, setLoading] = useState(false)
  const supabase = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Handle successful authentication and redirect to returnUrl
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Get returnUrl from query params
        const returnUrl = searchParams.get('returnUrl')
        
        // Validate returnUrl to prevent open redirects
        let redirectPath = '/dashboard'; // Default destination
        
        if (returnUrl) {
          try {
            // Decode the returnUrl
            const decodedUrl = decodeURIComponent(returnUrl);
            
            // Validate it's a safe same-origin path
            if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
              // Ensure it's not an auth page (prevent loops)
              if (!decodedUrl.startsWith('/login') && !decodedUrl.startsWith('/auth')) {
                redirectPath = decodedUrl;
              }
            }
          } catch (error) {
            console.error('Invalid returnUrl:', error);
            // Fall back to default dashboard
          }
        }

        // Small delay to ensure session is fully established
        setTimeout(() => {
          router.push(redirectPath);
        }, 100);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router, searchParams]);

  const handleGoogleAuth = async () => {
    // Prevent double-clicking or multiple simultaneous requests
    if (loading) {
      console.log("⚠️ OAuth request already in progress, ignoring duplicate click");
      return;
    }
    
    setLoading(true)
    try {
      // Preserve returnUrl through OAuth flow
      const returnUrl = searchParams.get('returnUrl');
      const callbackUrl = getAuthCallbackURL(returnUrl || undefined);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          // 1. You MUST ask for the Gmail scope
          scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
          queryParams: {
            // 2. You MUST ask for offline access
            access_type: 'offline',
            // 3. You MUST force the consent screen
            prompt: 'consent',
          },
        },
      })
      
      if (error) {
        console.error("❌ Google OAuth Error:", error);
        setLoading(false); // Reset loading on error
        throw error;
      }
      
      console.log("✅ Google OAuth request sent successfully");
      // Don't set loading to false here - let the redirect happen
      // The loading state will reset when the component unmounts or page reloads
    } catch (error) {
      console.error('❌ Error signing in with Google:', error)
      setLoading(false); // Reset loading on error
    }
  }

  const handleMicrosoftAuth = async () => {
    // Prevent double-clicking or multiple simultaneous requests
    if (loading) {
      console.log("⚠️ OAuth request already in progress, ignoring duplicate click");
      return;
    }
    
    setLoading(true)
    try {
      // Preserve returnUrl through OAuth flow
      const returnUrl = searchParams.get('returnUrl');
      const callbackUrl = getAuthCallbackURL(returnUrl || undefined);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: callbackUrl,
          scopes: 'email profile openid https://graph.microsoft.com/Mail.Read'
        }
      })
      if (error) {
        setLoading(false); // Reset loading on error
        throw error;
      }
      // Don't set loading to false here - let the redirect happen
    } catch (error) {
      console.error('Error signing in with Microsoft:', error)
      setLoading(false); // Reset loading on error
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8">
            <Link href="/" className="inline-block">
              <h1 className="text-xl font-bold text-gray-900">Lighthouse</h1>
            </Link>
          </div>

          {/* Sign in Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sign in</h2>
            
            {/* OAuth Buttons */}
            <div className="space-y-4 pb-1">
              {/* Google Sign-in Button */}
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="oauth-button w-full flex items-center justify-center gap-3 px-5 py-3.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>

              {/* Microsoft Sign-in Button */}
              <button
                onClick={handleMicrosoftAuth}
                disabled={loading}
                className="oauth-button w-full flex items-center justify-center gap-3 px-5 py-3.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#F25022" d="M0 0h11v11H0z"/>
                  <path fill="#00A4EF" d="M12 0h11v11H12z"/>
                  <path fill="#7FBA00" d="M0 12h11v11H0z"/>
                  <path fill="#FFB900" d="M12 12h11v11H12z"/>
                </svg>
                <span>Sign in with Microsoft</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 space-y-4">
            {/* Terms Acknowledgment */}
            <p className="text-xs text-gray-600 text-center">
              By proceeding you acknowledge that you have read, understood and agree to our{' '}
              <Link href="/legal/terms" className="text-gray-900 hover:underline">
                Terms and Conditions.
              </Link>
            </p>

            {/* Footer Links */}
            <ul className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-600">
              <li>
                <span>© {new Date().getFullYear()} Lighthouse</span>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-gray-900 hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-gray-900 hover:underline">
                  Support
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}
