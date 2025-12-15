import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthForm from '@/components/auth/AuthForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const supabase = await createClient()

  // Check for user and session
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  // A "fully valid" session requires:
  // 1. User exists (Supabase auth)
  // 2. Provider token exists (Google refresh token for Gmail/Calendar access)
  // 3. User email exists
  // Only redirect to dashboard if ALL conditions are met
  const hasValidGoogleToken =
    !!user &&
    !!session?.provider_token &&
    !!session?.user?.email

  // If user is fully authenticated WITH a valid Google token, send them to dashboard
  if (hasValidGoogleToken) {
    redirect('/dashboard')
  }

  // Otherwise (no user OR missing Google token), show login form
  // This allows users with expired/missing Google tokens to re-authenticate
  // OAuth login continues to use the existing AuthForm client logic.
  // You can add a traditional email/password form bound to the `login` server action here if desired.
  return <AuthForm />
}
