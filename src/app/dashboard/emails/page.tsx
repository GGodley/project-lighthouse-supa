'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { RefreshCw, Search, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Email = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  received_at: string;
  created_at: string;
};

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch('/api/emails', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to load emails (${res.status})`)
      }
      const json = await res.json()
      setEmails(json.emails || [])
    } catch (error) {
      console.error('Error fetching emails:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const invokeSync = useCallback(async (session: { provider_token?: string | null; access_token?: string | null }) => {
    if (!session?.provider_token) return
    const accessToken = session.access_token
    const providerToken = session.provider_token
    const { error } = await supabase.functions.invoke('sync-emails', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { provider_token: providerToken }
    })
    if (error) throw error
  }, [supabase])

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetchEmails() // already logged in → fetch immediately
      }
    })()

    const { data: authSub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.provider_token) {
        await invokeSync(session)
        await fetchEmails()
      }
      if (event === 'INITIAL_SESSION' && session) {
        await fetchEmails()
      }
    })

    return () => {
      authSub.subscription.unsubscribe()
    }
  }, [fetchEmails, invokeSync, supabase.auth])

  const syncEmails = async () => {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            scopes: 'https://www.googleapis.com/auth/gmail.readonly',
            queryParams: { prompt: 'consent', access_type: 'offline' }
          }
        })
        return
      }
      await invokeSync(session)
      await fetchEmails()
    } catch (error) {
      console.error('Error syncing emails:', error)
      alert('Failed to sync emails. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/login')
  }

  const filteredEmails = emails.filter((email) => {
    const subject = (email.subject || '').toLowerCase()
    const sender = (email.sender || '').toLowerCase()
    const snippet = (email.snippet || '').toLowerCase()
    const term = searchTerm.toLowerCase()
    return subject.includes(term) || sender.includes(term) || snippet.includes(term)
  })

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString()
    }
  }

  const getSenderName = (sender: string) => {
    const match = sender.match(/^(.+?)\s*<(.+)>$/)
    return match ? match[1].trim() : sender
  }

  const getSenderEmail = (sender: string) => {
    const match = sender.match(/^(.+?)\s*<(.+)>$/)
    return match ? match[2].trim() : sender
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Emails</h1>
          <p className="text-gray-600">View and sync your recent emails</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={syncEmails}
            disabled={syncing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Emails'}</span>
          </Button>
          <Button onClick={signOut} variant="outline">Sign Out</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Emails List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="divide-y divide-gray-200">
          {filteredEmails.map((email) => (
            <div key={email.id} className={`p-6 hover:bg-gray-50`}>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {getSenderName(email.sender).charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getSenderName(email.sender)}
                      </p>
                      <span className="text-sm text-gray-500">
                        &lt;{getSenderEmail(email.sender)}&gt;
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">
                        {email.received_at ? formatDate(email.received_at) : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {email.subject}
                  </p>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {email.snippet || ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        
            {filteredEmails.length === 0 && (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500">No new mails</div>
          </div>
        )}
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
