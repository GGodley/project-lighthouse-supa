'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { Users, Calendar, Mail, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'


interface DashboardStats {
  totalClients: number
  activeClients: number
  upcomingMeetings: number
  recentEmails: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeClients: 0,
    upcomingMeetings: 0,
    recentEmails: 0
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [recentEmails, setRecentEmails] = useState<Array<{ id: number; subject: string | null; sender: string | null; received_at: string | null; snippet: string | null }>>([])
  const supabase = useSupabase()

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      try {
        // Fetch clients
        const { data: clients } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.id)

        // Fetch meetings
        const { data: meetings } = await supabase
          .from('meetings')
          .select('*')
          .eq('user_id', user.id)
          .gte('meeting_date', new Date().toISOString())

        // Fetch recent emails
        const { data: emails } = await supabase
          .from('emails')
          .select('*')
          .eq('user_id', user.id)
          .order('received_at', { ascending: false })
          .limit(10)

        setRecentEmails(emails || [])

        setStats({
          totalClients: clients?.length || 0,
          activeClients: clients?.filter(c => c.status === 'Healthy').length || 0,
          upcomingMeetings: meetings?.length || 0,
          recentEmails: (emails || []).length
        })
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [supabase])

  const invokeSync = async (session: { access_token?: string | null; provider_token?: string | null }) => {
    const accessToken = session.access_token
    const providerToken = session.provider_token
    if (!providerToken) return
    const { error } = await supabase.functions.invoke('sync-emails', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { provider_token: providerToken }
    })
    if (error) throw error
  }

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
      const { data: emails } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(10)
      setRecentEmails(emails || [])
    } catch (e) {
      console.error('Sync error:', e)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Clients',
      value: stats.totalClients,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Healthy Clients',
      value: stats.activeClients,
      icon: TrendingUp,
      color: 'bg-green-500',
      change: '+8%'
    },
    {
      title: 'Upcoming Meetings',
      value: stats.upcomingMeetings,
      icon: Calendar,
      color: 'bg-purple-500',
      change: '+5%'
    },
    {
      title: 'Recent Emails',
      value: stats.recentEmails,
      icon: Mail,
      color: 'bg-red-500',
      change: '+15%'
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here&apos;s what&apos;s happening with your clients.</p>
        <div className="mt-4">
          <Button onClick={syncEmails} disabled={syncing} className="flex items-center gap-2">
            <Mail className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync My Emails'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <div key={stat.title} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-full ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
            <div className="mt-4">
              <span className={`text-sm ${
                stat.change.startsWith('+') 
                  ? 'text-green-600' 
                  : 'text-gray-600'
              }`}>
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="font-medium">Add New Client</div>
              <div className="text-sm text-gray-600">Create a new client profile</div>
            </button>
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="font-medium">Schedule Meeting</div>
              <div className="text-sm text-gray-600">Add a new meeting</div>
            </button>
            <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="font-medium">Sync Emails</div>
              <div className="text-sm text-gray-600">Import latest emails</div>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">10 Most Recent Emails</h3>
          <div className="divide-y">
            {recentEmails.length === 0 ? (
              <div className="text-gray-500">No emails found. Go to Emails tab to sync.</div>
            ) : (
              recentEmails.map((e) => (
                <div key={e.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 truncate">{e.subject || 'No Subject'}</div>
                    <div className="text-xs text-gray-500 ml-4 whitespace-nowrap">
                      {e.received_at ? new Date(e.received_at).toLocaleString() : ''}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 truncate">From: {e.sender}</div>
                  <div className="text-sm text-gray-500 line-clamp-2">{e.snippet}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
