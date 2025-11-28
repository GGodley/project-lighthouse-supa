import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthForm from '@/components/auth/AuthForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Check for existing session before showing login form
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // If user is already authenticated, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }
  
  return <AuthForm />
}
