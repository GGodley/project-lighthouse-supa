'use client'

import { useEffect, useState, useRef } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import DashboardSyncManager from '@/components/DashboardSyncManager'
import { useGmailSync } from '@/hooks/useGmailSync'
import { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()
  const router = useRouter()
  const { triggerSync } = useGmailSync()
  const hasSyncedRef = useRef(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        router.push('/login')
        return
      }

      // Profiles table may not exist or may be empty initially; don't block UI
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()
        
        // If profile doesn't exist, try to create it
        if (!profile && authUser) {
          console.log('📝 Profile not found in DashboardLayout. Creating profile for user:', authUser.id);
          
          const provider = authUser.app_metadata?.provider || 'google';
          const providerId = authUser.app_metadata?.provider_id || 
                            authUser.user_metadata?.provider_id || 
                            authUser.email || '';
          const fullName = authUser.user_metadata?.full_name || 
                         authUser.user_metadata?.name || 
                         null;
          
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: authUser.id,
              email: authUser.email || '',
              full_name: fullName,
              provider: provider,
              provider_id: providerId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (createError) {
            console.error('❌ Failed to create profile in DashboardLayout:', createError);
            setUser(null)
          } else {
            console.log('✅ Profile created successfully in DashboardLayout:', newProfile.id);
            setUser(newProfile)
          }
        } else {
          setUser(profile ?? null)
        }
      } catch (error) {
        console.error('Error fetching/creating profile:', error);
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [supabase, router])

  // Auto-trigger Gmail sync when user lands on dashboard
  useEffect(() => {
    // Prevent double-fires in React Strict Mode
    if (hasSyncedRef.current) {
      return
    }

    const autoSync = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession()

        // Only trigger if:
        // 1. Session exists
        // 2. Provider token exists (Google access token)
        // 3. We haven't synced yet
        if (session?.provider_token && !hasSyncedRef.current) {
          console.log('🔄 Auto-triggering Gmail sync on dashboard load...')
          hasSyncedRef.current = true
          await triggerSync()
        }
      } catch (error) {
        // Log error but don't block UI
        console.error('❌ Error in auto-sync:', error)
      }
    }

    // Only run after loading is complete
    if (!loading) {
      autoSync()
    }
  }, [supabase, triggerSync, loading])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // Do not block rendering if profile is missing; continue to show dashboard

  return (
    <div className="flex h-screen glass-bg">
      <DashboardSyncManager />
      <Sidebar onSignOut={handleSignOut} />
      <main className="flex-1 overflow-auto relative">
        {children}
      </main>
    </div>
  )
}
