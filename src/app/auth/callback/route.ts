import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Get the user after successful authentication
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Create or update user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
            provider: user.app_metadata?.provider || 'google',
            provider_id: user.user_metadata?.provider_id || user.id,
            gmail_access_token: user.user_metadata?.gmail_access_token,
            gmail_refresh_token: user.user_metadata?.gmail_refresh_token,
            microsoft_access_token: user.user_metadata?.microsoft_access_token,
            microsoft_refresh_token: user.user_metadata?.microsoft_refresh_token,
            updated_at: new Date().toISOString()
          })

        if (profileError) {
          console.error('Error creating/updating profile:', profileError)
        }
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}${next}`)
}
