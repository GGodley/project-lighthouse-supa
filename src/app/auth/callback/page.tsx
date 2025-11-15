'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/SupabaseProvider'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useSupabase()

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      
      if (code) {
        // Exchange code for session - this works client-side where code verifier cookie is accessible
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        
        if (error) {
          console.error('Auth callback error:', error)
          router.push(`/login?error=${encodeURIComponent(error.message)}`)
          return
        }

        // Create profile if it doesn't exist
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', user.id)
              .maybeSingle()
            
            if (!existingProfile) {
              const provider = user.app_metadata?.provider || 'google'
              const providerId = user.app_metadata?.provider_id || user.user_metadata?.provider_id || user.email || ''
              const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null
              
              await supabase
                .from('profiles')
                .insert({
                  id: user.id,
                  email: user.email || '',
                  full_name: fullName,
                  provider: provider,
                  provider_id: providerId,
                })
            }
          }
        } catch (profileError) {
          console.error('Profile creation error:', profileError)
          // Don't fail auth if profile creation fails
        }

        // Redirect to dashboard
        router.push('/dashboard')
      } else {
        router.push('/login?error=No authorization code provided')
      }
    }

    handleCallback()
  }, [searchParams, supabase, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg">Completing sign in...</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}

