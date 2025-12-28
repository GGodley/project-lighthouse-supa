'use client'

import { useEffect, useRef } from 'react'
import { useGmailSync } from '@/hooks/useGmailSync'
import { useCalendarSync } from '@/hooks/useCalendarSync'
import { useSupabase } from '@/components/SupabaseProvider'

/**
 * DashboardSyncManager component
 * 
 * Manages automatic syncing of Gmail threads and Calendar events when user arrives at Dashboard.
 * Uses the useGmailSync and useCalendarSync hooks to trigger syncs via Trigger.dev.
 * 
 * Both syncs are triggered in parallel on initial login.
 */
export default function DashboardSyncManager() {
  const supabase = useSupabase()
  const { triggerSync: triggerGmailSync } = useGmailSync()
  const { triggerSync: triggerCalendarSync } = useCalendarSync()
  const hasSynced = useRef(false)

  useEffect(() => {
    if (hasSynced.current) {
      return
    }

    const checkAndTriggerSync = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.provider_token) {
        hasSynced.current = true
        console.log('🔄 DashboardSyncManager: Auto-triggering initial syncs (Gmail + Calendar)...')
        
        // Trigger both syncs in parallel
        await Promise.all([
          triggerGmailSync(),
          triggerCalendarSync(),
        ])
        
        console.log('✅ DashboardSyncManager: Both syncs triggered successfully')
      }
    }

    checkAndTriggerSync()
  }, [supabase, triggerGmailSync, triggerCalendarSync])

  // This component renders nothing - it's purely for side effects
  return null
}
