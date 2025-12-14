'use client'

import { useEffect, useRef } from 'react'
import { useGmailSync } from '@/hooks/useGmailSync'
import { useSupabase } from '@/components/SupabaseProvider'

/**
 * DashboardSyncManager component
 * 
 * Manages automatic syncing of Gmail threads when user arrives at Dashboard.
 * Uses the useGmailSync hook to trigger syncs via the ingest-threads edge function.
 */
export default function DashboardSyncManager() {
  const supabase = useSupabase()
  const { triggerSync } = useGmailSync()
  const hasSynced = useRef(false)

  useEffect(() => {
    if (hasSynced.current) {
      return
    }

    const checkAndTriggerSync = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.provider_token) {
        hasSynced.current = true
        console.log('🔄 DashboardSyncManager: Auto-triggering initial sync...')
        await triggerSync()
      }
    }

    checkAndTriggerSync()
  }, [supabase, triggerSync])

  // This component renders nothing - it's purely for side effects
  return null
}
