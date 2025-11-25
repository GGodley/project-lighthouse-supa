import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users, Calendar, Mail, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react'
import SyncEmailsButton from '@/components/SyncEmailsButton'
import ConsiderTouchingBase from '@/components/ConsiderTouchingBase'

export const dynamic = 'force-dynamic'

interface DashboardStats {
  totalClients: number
  activeClients: number
  upcomingMeetings: number
  recentEmails: number
  totalCustomers: number
  customerCountChange: number | null
  customerCountTrend: 'up' | 'down' | 'neutral'
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // --- START DIAGNOSTIC LOGS ---
  console.log("--- [Dashboard Page] Server-Side Auth Check ---");
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[Dashboard Page] Error getting user:", error.message);
    }
    console.log("[Dashboard Page] Server-side user object found:", !!user);
    if (user) {
      console.log("[Dashboard Page] Server-side User ID:", user.id);
    } else {
      console.warn("[Dashboard Page] WARNING: No user found on the server-side. This is the likely cause of the crash. Redirecting to login.");
      // If no user, we can't render the page, so redirect.
      redirect('/login');
    }
  } catch (e) {
      const error = e as Error;
      console.error("[Dashboard Page] FATAL ERROR during auth check:", error.message);
  }
  console.log("--- [Dashboard Page] End Auth Check ---");
  // --- END DIAGNOSTIC LOGS ---

  // Fetch dashboard data server-side
  let stats: DashboardStats = {
    totalClients: 0,
    activeClients: 0,
    upcomingMeetings: 0,
    recentEmails: 0,
    totalCustomers: 0,
    customerCountChange: null,
    customerCountTrend: 'neutral'
  }
  let recentEmails: Array<{ id: number; subject: string | null; sender: string | null; received_at: string | null; snippet: string | null }> = []

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
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
        .gte('start_time', new Date().toISOString())

      // Fetch recent emails
      const { data: emails } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(10)

      recentEmails = emails || []

      // Fetch customer count data directly from database (server-side)
      let customerData = {
        currentCount: 0,
        percentageChange: null as number | null,
        trend: 'neutral' as 'up' | 'down' | 'neutral'
      }

      try {
        // Get current active customer count from profiles table (fast lookup)
        const { data: profile } = await supabase
          .from('profiles')
          .select('active_customer_count')
          .eq('id', user.id)
          .single()

        const currentCount = profile?.active_customer_count ?? 0

        // Get previous month's count
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1

        let previousYear = currentYear
        let previousMonth = currentMonth - 1
        if (previousMonth < 1) {
          previousMonth = 12
          previousYear = currentYear - 1
        }

        const { data: previousMonthData } = await supabase
          .from('monthly_customer_counts')
          .select('customer_count')
          .eq('user_id', user.id)
          .eq('year', previousYear)
          .eq('month', previousMonth)
          .single()

        const previousMonthCount = previousMonthData?.customer_count ?? null

        // Calculate percentage change
        let percentageChange: number | null = null
        let trend: 'up' | 'down' | 'neutral' = 'neutral'

        if (previousMonthCount !== null && previousMonthCount > 0) {
          percentageChange = ((currentCount - previousMonthCount) / previousMonthCount) * 100
          if (percentageChange > 0) {
            trend = 'up'
          } else if (percentageChange < 0) {
            trend = 'down'
          } else {
            trend = 'neutral'
          }
        } else if (previousMonthCount === 0 && currentCount > 0) {
          percentageChange = 100
          trend = 'up'
        }

        customerData = {
          currentCount,
          percentageChange: percentageChange !== null ? Math.round(percentageChange * 100) / 100 : null,
          trend
        }
      } catch (error) {
        console.error('Error fetching customer count data:', error)
      }

      stats = {
        totalClients: clients?.length || 0,
        activeClients: clients?.filter(c => c.status === 'Healthy').length || 0,
        upcomingMeetings: meetings?.length || 0,
        recentEmails: (emails || []).length,
        totalCustomers: customerData.currentCount,
        customerCountChange: customerData.percentageChange,
        customerCountTrend: customerData.trend
      }
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  }

  // Format percentage change for display
  const formatPercentageChange = (change: number | null) => {
    if (change === null) return 'N/A'
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  const statCards = [
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'bg-blue-500',
      change: formatPercentageChange(stats.customerCountChange),
      trend: stats.customerCountTrend
    },
    {
      title: 'Total Clients',
      value: stats.totalClients,
      icon: Users,
      color: 'bg-indigo-500',
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
    <div className="min-h-screen glass-bg">
      <div className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600">Welcome back! Here&apos;s what&apos;s happening with your clients.</p>
            <div className="mt-4">
              <SyncEmailsButton />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const isPositive = stat.change?.startsWith('+') || (stat.trend === 'up' && stat.change !== 'N/A')
          const isNegative = stat.change?.startsWith('-') || stat.trend === 'down'
          const showTrendIcon = stat.trend && stat.trend !== 'neutral' && stat.change !== 'N/A'
          
          return (
            <div key={stat.title} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${stat.color}`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center">
                {showTrendIcon && (
                  <span className="mr-1">
                    {stat.trend === 'up' ? (
                      <ArrowUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-red-600" />
                    )}
                  </span>
                )}
                <span className={`text-sm ${
                  isPositive 
                    ? 'text-green-600' 
                    : isNegative
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}>
                  {stat.change}
                </span>
                {stat.change !== 'N/A' && stat.title === 'Total Customers' && (
                  <span className="text-xs text-gray-500 ml-1">vs last month</span>
                )}
              </div>
            </div>
          )
        })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConsiderTouchingBase />

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
      </div>
    </div>
  )
}
