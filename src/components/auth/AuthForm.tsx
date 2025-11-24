'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/SupabaseProvider'
import { Button } from '@/components/ui/Button'
import { Mail } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to Lighthouse
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your customer success management platform
          </p>
        </div>
        <div className="mt-8 space-y-4">
          <Button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            <Mail className="w-5 h-5 mr-2" />
            Continue with Google
          </Button>
          <Button
            onClick={handleMicrosoftAuth}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Mail className="w-5 h-5 mr-2" />
            Continue with Microsoft
          </Button>
        </div>
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy.
            We&apos;ll access your email to help you manage your customer relationships.
          </p>
        </div>
      </div>
    </div>
  )
}
