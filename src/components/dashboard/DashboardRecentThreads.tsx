'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import Link from 'next/link'
import { ArrowRight, Mail } from 'lucide-react'

interface Thread {
  thread_id: string
  subject: string | null
  snippet: string | null
  last_message_date: string | null
  company_id?: string | null
}

export default function DashboardRecentThreads() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()

  useEffect(() => {
    const fetchThreads = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Cast through unknown to access untyped tables (threads and thread_company_link)
        // This is necessary until types are regenerated to include these tables
        const client = supabase as any;

        // Get recent threads
        const { data: threadsData, error: threadsError } = await client
          .from('threads')
          .select('thread_id, subject, snippet, last_message_date')
          .eq('user_id', user.id)
          .order('last_message_date', { ascending: false })
          .limit(5)

        if (threadsError) throw threadsError

        // Get company IDs for each thread
        const threadIds = (threadsData || []).map((t: Thread) => t.thread_id)
        if (threadIds.length > 0) {
          const { data: links } = await client
            .from('thread_company_link')
            .select('thread_id, company_id')
            .in('thread_id', threadIds)

          // Map company_id to threads
          const threadsWithCompanies = (threadsData || []).map(thread => {
            const link = links?.find(l => l.thread_id === thread.thread_id)
            return { ...thread, company_id: link?.company_id || null }
          })

          setThreads(threadsWithCompanies)
        } else {
          setThreads([])
        }
      } catch (err) {
        console.error('Error fetching threads:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchThreads()
  }, [supabase])

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "No date"
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return "Today"
      if (diffDays === 1) return "Yesterday"
      if (diffDays < 7) return `${diffDays} days ago`
      
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      })
    } catch {
      return "No date"
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading threads...</p>
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No recent threads
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => {
        const threadLink = thread.company_id 
          ? `/dashboard/customer-threads/${thread.company_id}?thread=${thread.thread_id}`
          : '#';
        
        return (
          <Link key={thread.thread_id} href={threadLink} className="block">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {thread.subject || "No subject"}
                  </p>
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                </div>
                {thread.snippet && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {thread.snippet}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {formatDate(thread.last_message_date)}
                </p>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

