'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/SupabaseProvider'

export const dynamic = 'force-dynamic'

export default function Home() {
  const router = useRouter()
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        console.log("🔍 ROOT PAGE AUTH CHECK:");
        console.log("User exists:", !!user);
        console.log("User ID:", user?.id);
        
        if (user) {
          console.log("✅ User authenticated, redirecting to dashboard");
          router.push('/dashboard')
        } else {
          console.log("❌ No user found, redirecting to login");
          router.push('/login')
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return null
}