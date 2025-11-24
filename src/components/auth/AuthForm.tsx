'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/SupabaseProvider'
import { getURL } from '@/lib/utils'

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
      const callbackUrl = returnUrl 
        ? `${getURL()}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        : `${getURL()}/auth/callback`;

      const options = {
        redirectTo: callbackUrl,
        scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      };

      // --- DIAGNOSTIC LOG ---
      // This will show us the exact blueprint being used for Google OAuth
      console.log("🔍 GOOGLE OAUTH DIAGNOSTIC - Complete Options Blueprint:");
      console.log("Provider: google");
      console.log("Options:", JSON.stringify(options, null, 2));
      console.log("Dynamic URL:", getURL());
      console.log("Full Redirect URL:", options.redirectTo);
      console.log("Requested Scopes:", options.scopes);
      console.log("Query Parameters:", options.queryParams);
      console.log("--- END DIAGNOSTIC ---");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options
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
      const callbackUrl = returnUrl 
        ? `${getURL()}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        : `${getURL()}/auth/callback`;

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
      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center min-h-screen py-20 px-6 lg:px-8">
        <div className="max-w-4xl w-full">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Sign in to Lighthouse
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto">
              Choose your authentication provider to continue
            </p>
          </div>

          {/* Two Square Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Google Sign-in Box */}
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="group relative aspect-square bg-white border-2 border-gray-200 rounded-lg p-8 hover:border-gray-900 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                {/* Google Logo */}
                <div className="w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                {/* Google Text */}
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 group-hover:text-gray-900">Google</p>
                  <p className="text-sm text-gray-600 mt-1">Sign in with Google</p>
                </div>
              </div>
            </button>

            {/* Microsoft Sign-in Box */}
            <button
              onClick={handleMicrosoftAuth}
              disabled={loading}
              className="group relative aspect-square bg-white border-2 border-gray-200 rounded-lg p-8 hover:border-gray-900 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                {/* Microsoft Logo */}
                <div className="w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#F25022" d="M0 0h11v11H0z"/>
                    <path fill="#00A4EF" d="M12 0h11v11H12z"/>
                    <path fill="#7FBA00" d="M0 12h11v11H0z"/>
                    <path fill="#FFB900" d="M12 12h11v11H12z"/>
                  </svg>
                </div>
                {/* Microsoft Text */}
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 group-hover:text-gray-900">Microsoft</p>
                  <p className="text-sm text-gray-600 mt-1">Sign in with Microsoft</p>
                </div>
              </div>
            </button>
          </div>

          {/* Footer Text */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-500">
              By continuing, you agree to our Terms of Service and Privacy Policy.
              <br />
              We&apos;ll access your email to help you manage your customer relationships.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
