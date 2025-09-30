'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type EmailRow = {
  id: string
  subject: string | null
  sender: string | null
  snippet: string | null
  received_at: string | null
  summary?: string | null
  sentiment?: string | null
}

type Props = {
  onEmailInserted?: (email: EmailRow) => void
  onEmailUpdated?: (email: EmailRow) => void
  onOverlayChange?: (visible: boolean, message?: string) => void
}

export default function EmailSyncManager({ onEmailInserted, onEmailUpdated, onOverlayChange }: Props) {
  const supabase = createClient()
  const [jobStatus, setJobStatus] = useState<'none' | 'running' | 'completed' | 'failed'>('none')

  const startSync = useCallback(async () => {
    const { data: sessionRes } = await supabase.auth.getSession()
    const session = sessionRes?.session
    if (!session || !session.user) {
      onOverlayChange?.(false)
      if (typeof window !== 'undefined') {
        window.alert('You are not authenticated yet. Please sign in and try again.')
      }
      return
    }
    if (!session.provider_token) {
      onOverlayChange?.(false)
      if (typeof window !== 'undefined') {
        window.alert('Missing Google provider token. Please re-authenticate with Google.')
      }
      return
    }

    // Un-typed client to avoid CI type mismatch issues
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const untyped = require('@supabase/auth-helpers-nextjs').createClientComponentClient()

    try {
      const { data: newJob, error: jobErr } = await untyped
        .from('sync_jobs')
        .insert({ user_id: session.user.id, status: 'pending' })
        .select()
        .single()

      if (jobErr || !newJob) {
        onOverlayChange?.(false)
        if (typeof window !== 'undefined') {
          window.alert('Unable to start email sync (permissions). Please try again after signing in.')
        }
        return
      }

      setJobStatus('running')
      onOverlayChange?.(true, 'Initializing your account...')
      await supabase.functions.invoke('sync-emails', {
        body: { jobId: newJob.id, provider_token: session.provider_token }
      })
    } catch {
      onOverlayChange?.(false)
      if (typeof window !== 'undefined') {
        window.alert('We could not create a background job due to security rules. Please retry.')
      }
    }
  }, [onOverlayChange, supabase])

  const ensureJobAndStart = useCallback(async () => {
    // Wait for a valid session before any DB access
    const { data: sessionRes } = await supabase.auth.getSession()
    const session = sessionRes?.session
    if (!session || !session.user) {
      return
    }
    const user = session.user

    // Check latest job
    const { data: latestJob } = await supabase
      .from('sync_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestJob) {
      await startSync()
      return
    }

    // Use existing job status
    if (latestJob.status === 'running' || latestJob.status === 'pending') {
      setJobStatus('running')
      onOverlayChange?.(true, 'Initializing your account...')
    } else {
      setJobStatus(latestJob.status as 'completed' | 'failed' | 'none')
      onOverlayChange?.(false)
    }
  }, [onOverlayChange, supabase])

  useEffect(() => {
    // Only run when a session is present; subscribe to auth state for race-free init
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null
    ;(async () => {
      const { data: sessionRes } = await supabase.auth.getSession()
      if (sessionRes.session) {
        await ensureJobAndStart()
      }
      const sub = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          await ensureJobAndStart()
        }
      })
      unsub = sub
    })()
    return () => {
      unsub?.data.subscription.unsubscribe()
    }
  }, [ensureJobAndStart, supabase.auth])

  // Poll job status while running
  useEffect(() => {
    if (jobStatus !== 'running') return
    const interval = setInterval(async () => {
      const { data: latest } = await supabase
        .from('sync_jobs')
        .select('status, details')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (latest?.status === 'completed' || latest?.status === 'failed') {
        setJobStatus(latest.status as 'completed' | 'failed')
        onOverlayChange?.(false)
        clearInterval(interval)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [jobStatus, supabase, onOverlayChange])

  // Realtime subscription for emails INSERT/UPDATE
  useEffect(() => {
    const channel = supabase
      .channel('emails-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails' }, (payload) => {
        onEmailInserted?.(payload.new as EmailRow)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emails' }, (payload) => {
        onEmailUpdated?.(payload.new as EmailRow)
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [onEmailInserted, onEmailUpdated, supabase])

  return null
}


