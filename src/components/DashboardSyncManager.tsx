'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { useThreadSync } from '@/hooks/useThreadSync'

/**
 * DashboardSyncManager component
 * 
 * Manages automatic syncing of threads and calendar when user arrives at Dashboard.
 * - Triggers thread sync first (if no active job exists)
 * - Then triggers calendar sync after thread sync has started
 * - Prevents duplicate syncs using session flags and job checks
 * - Runs silently in the background without blocking UI
 */
export default function DashboardSyncManager() {
  const supabase = useSupabase()
  const [providerToken, setProviderToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const hasInitiatedSyncsRef = useRef(false)
  const calendarSyncInitiatedRef = useRef(false)
  const threadSyncStartedRef = useRef(false)

  // Get auth session for provider token and user email
  useEffect(() => {
    const getAuthData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setProviderToken(session.provider_token || null)
        setUserEmail(session.user?.email || null)
      }
    }
    getAuthData()

    // Listen for auth state changes (e.g., on login, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Update provider token and email on sign in or token refresh
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        setProviderToken(session.provider_token || null)
        setUserEmail(session.user?.email || null)
        
        // Reset flags on new sign-in (but not on token refresh)
        if (event === 'SIGNED_IN') {
          hasInitiatedSyncsRef.current = false
          calendarSyncInitiatedRef.current = false
          threadSyncStartedRef.current = false
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  // Thread sync hook
  const { syncStatus, startSync: startThreadSync } = useThreadSync(providerToken, userEmail)

  // Calendar sync function
  const startCalendarSync = useCallback(async () => {
    if (calendarSyncInitiatedRef.current) {
      console.log('📅 Calendar sync already initiated this session, skipping')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.log('📅 No active session for calendar sync')
        return
      }

      const providerToken = session.provider_token
      
      if (!providerToken) {
        console.error('📅 Could not find provider token for calendar sync')
        return
      }

      calendarSyncInitiatedRef.current = true
      console.log('📅 Starting calendar sync...')

      // Invoke sync-calendar function (fire and forget)
      const { error: syncError } = await supabase.functions.invoke('sync-calendar', {
        body: {
          provider_token: providerToken
        }
      })

      if (syncError) {
        console.error('📅 Calendar sync error:', syncError)
        // Don't throw - allow it to fail silently
      } else {
        console.log('📅 Calendar sync started successfully')
      }
    } catch (err) {
      console.error('📅 Calendar sync error:', err)
      // Don't throw - allow it to fail silently
    }
  }, [supabase])

  // Main sync orchestration logic
  useEffect(() => {
    // Before checking, refresh session data to ensure we have the latest provider_token
    const refreshSessionData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Update state if session has provider_token but state doesn't
        if (session.provider_token && !providerToken) {
          setProviderToken(session.provider_token)
        }
        if (session.user?.email && !userEmail) {
          setUserEmail(session.user.email)
        }
      }
    }
    
    // Only proceed if we have the required tokens and haven't already initiated syncs
    if (!providerToken || !userEmail) {
      // Try refreshing session data once before giving up
      refreshSessionData()
      return
    }
    
    if (hasInitiatedSyncsRef.current) {
      return
    }

    const initiateSyncs = async () => {
      try {
        // Check for existing thread sync jobs
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) {
          console.log('🔄 No authenticated user, skipping sync initiation')
          return
        }

        const { data: existingJobs, error: jobCheckError } = await supabase
          .from('sync_jobs')
          .select('id, status')
          .eq('user_id', session.user.id)
          .in('status', ['pending', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (jobCheckError) {
          console.error('🔄 Error checking for existing sync jobs:', jobCheckError)
          return
        }

        // If there's an existing running/pending job, don't start a new thread sync
        // but we can still start calendar sync after a delay
        if (existingJobs) {
          console.log('🔄 Existing thread sync job found (status:', existingJobs.status, '), skipping new thread sync')
          threadSyncStartedRef.current = true
          hasInitiatedSyncsRef.current = true
          
          // Start calendar sync after a short delay
          setTimeout(() => {
            startCalendarSync()
          }, 2000)
          return
        }

        // No existing job, start thread sync
        console.log('🔄 Starting thread sync...')
        hasInitiatedSyncsRef.current = true
        threadSyncStartedRef.current = true
        await startThreadSync()
      } catch (error) {
        console.error('🔄 Error initiating syncs:', error)
      }
    }

    initiateSyncs()
  }, [providerToken, userEmail, supabase, startThreadSync, startCalendarSync])

  // Monitor thread sync status and trigger calendar sync when appropriate
  useEffect(() => {
    // Only trigger calendar sync if:
    // 1. Thread sync has started (status is not 'idle' or 'failed')
    // 2. Calendar sync hasn't been initiated yet
    // 3. Thread sync is in progress or completed
    if (
      threadSyncStartedRef.current &&
      !calendarSyncInitiatedRef.current &&
      (syncStatus === 'syncing' || syncStatus === 'creating_job' || syncStatus === 'completed')
    ) {
      // Wait a bit for thread sync to establish, then start calendar sync
      const timer = setTimeout(() => {
        console.log('📅 Thread sync is in progress, starting calendar sync...')
        startCalendarSync()
      }, 3000) // 3 second delay to let thread sync establish

      return () => clearTimeout(timer)
    }
  }, [syncStatus, startCalendarSync])

  // This component renders nothing - it's purely for side effects
  return null
}


