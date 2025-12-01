'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { useThreadSync } from '@/hooks/useThreadSync'

/**
 * DashboardSyncManager component
 * 
 * Manages automatic syncing of threads and calendar when user arrives at Dashboard.
 * - Triggers thread sync first (if no active job exists)
 * - Starts calendar sync independently after a short delay (3 seconds)
 * - Calendar sync does not wait for thread sync completion (they have independent rate limits)
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
        // Guard: If email or provider token is missing, don't start syncs
        if (!session.user?.email || !session.provider_token) {
          console.warn('DashboardSyncManager: Missing email or provider token. Syncs will not start. A redirect should have occurred.')
          // Don't set state, which prevents syncs from starting
          return
        }
        
        setProviderToken(session.provider_token)
        setUserEmail(session.user.email)
      }
    }
    getAuthData()

    // Listen for auth state changes (e.g., on login, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Update provider token and email on sign in or token refresh
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        // Guard: Only set state if both email and token are present
        if (!session.user?.email || !session.provider_token) {
          console.warn('DashboardSyncManager: Missing email or provider token after auth state change. Syncs will not start.')
          return
        }
        
        setProviderToken(session.provider_token)
        setUserEmail(session.user.email)
        
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

  // Start calendar sync independently - Gmail and Calendar APIs have separate rate limits
  useEffect(() => {
    // Start calendar sync as soon as thread sync has been initiated
    // Small delay (3 seconds) for system organization, not for rate limits
    // Gmail API and Calendar API have independent quotas, so they can run in parallel safely
    if (
      threadSyncStartedRef.current &&
      !calendarSyncInitiatedRef.current &&
      providerToken &&
      userEmail &&
      syncStatus !== 'idle' // Thread sync has started (any status other than idle)
    ) {
      const timer = setTimeout(() => {
        console.log('📅 Starting calendar sync (independent of thread sync)...')
        startCalendarSync()
      }, 3000) // 3 second delay for system organization

      return () => clearTimeout(timer)
    }
    
    // Fallback: If thread sync fails immediately, still start calendar sync
    if (
      threadSyncStartedRef.current &&
      !calendarSyncInitiatedRef.current &&
      syncStatus === 'failed' &&
      providerToken &&
      userEmail
    ) {
      const fallbackTimer = setTimeout(() => {
        console.log('📅 Thread sync failed, starting calendar sync anyway...')
        startCalendarSync()
      }, 5000) // 5 second delay as fallback
      return () => clearTimeout(fallbackTimer)
    }
  }, [syncStatus, providerToken, userEmail, startCalendarSync])

  // This component renders nothing - it's purely for side effects
  return null
}


