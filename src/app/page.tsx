import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Note: Middleware handles redirects for root path, but we keep this as a fallback
  // The middleware will redirect / to /dashboard if user is authenticated,
  // or to /login if not. This server component acts as a backup.
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log("🔍 ROOT PAGE SERVER-SIDE AUTH CHECK:");
    console.log("User exists:", !!user);
    console.log("User ID:", user?.id);
    
    if (user) {
      console.log("✅ User authenticated, redirecting to dashboard");
      redirect('/dashboard')
    } else {
      console.log("❌ No user found, redirecting to login");
      redirect('/login')
    }
  } catch (error) {
    console.error("Error checking auth:", error);
    redirect('/login')
  }
}