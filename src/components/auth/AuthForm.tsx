'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Mail } from 'lucide-react'

export default function AuthForm() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleGoogleAuth = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            scope: 'email profile https://www.googleapis.com/auth/gmail.readonly'
          }
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Error signing in with Google:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftAuth = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
          scopes: 'email profile openid https://graph.microsoft.com/Mail.Read'
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Error signing in with Microsoft:', error)
    } finally {
      setLoading(false)
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
