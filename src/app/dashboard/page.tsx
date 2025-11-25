import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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

interface DashboardFeatureRequest {
  id: string
  title: string
  company_name: string
  company_id: string
  requested_at: string
  source: 'email' | 'meeting' | 'thread'
  source_id: string | null
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
  let featureRequests: DashboardFeatureRequest[] = []

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

      // Fetch feature requests
      // First, get all company IDs for this user
      const { data: userCompanies } = await supabase
        .from('companies')
        .select('company_id, company_name')
        .eq('user_id', user.id)

      if (userCompanies && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.company_id)
        const companyMap = new Map(userCompanies.map(c => [c.company_id, c.company_name]))
        
        // Fetch feature requests
        const { data: featureRequestsData } = await supabase
          .from('feature_requests')
          .select('id, company_id, feature_id, requested_at, source, email_id, meeting_id, thread_id')
          .in('company_id', companyIds)
          .order('requested_at', { ascending: false })
          .limit(10)

        if (featureRequestsData && featureRequestsData.length > 0) {
          // Get unique feature IDs
          const featureIds = [...new Set(featureRequestsData.map(fr => fr.feature_id))]
          
          // Fetch features
          const { data: featuresData } = await supabase
            .from('features')
            .select('id, title')
            .in('id', featureIds)

          if (featuresData) {
            const featuresMap = new Map(featuresData.map(f => [f.id, f.title]))
            
            // Transform feature requests data
            featureRequests = featureRequestsData
              .map((fr) => {
                // Determine source_id based on source type
                let sourceId: string | null = null
                if (fr.source === 'thread' && fr.thread_id) {
                  sourceId = fr.thread_id
                } else if (fr.source === 'meeting' && fr.meeting_id) {
                  sourceId = fr.meeting_id.toString()
                } else if (fr.source === 'email' && fr.email_id) {
                  sourceId = fr.email_id.toString()
                }

                return {
                  id: fr.id,
                  title: featuresMap.get(fr.feature_id) || 'Unknown Feature',
                  company_name: companyMap.get(fr.company_id) || 'Unknown Company',
                  company_id: fr.company_id,
                  requested_at: fr.requested_at,
                  source: (fr.source || 'thread') as 'email' | 'meeting' | 'thread',
                  source_id: sourceId
                }
              })
              .filter(fr => fr.title !== 'Unknown Feature') // Filter out any with missing features
          }
        }
      }

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

  // Build navigation URL for feature request
  const getFeatureRequestUrl = (fr: DashboardFeatureRequest): string => {
    if (!fr.company_id) return '#'
    
    if (fr.source === 'thread' && fr.source_id) {
      return `/dashboard/customer-threads/${fr.company_id}?thread=${fr.source_id}`
    } else if (fr.source === 'meeting' && fr.source_id) {
      // Navigate to company page - meeting will be shown in interaction timeline
      return `/dashboard/customer-threads/${fr.company_id}`
    } else if (fr.source === 'email') {
      // Legacy email source - navigate to company page
      return `/dashboard/customer-threads/${fr.company_id}`
    }
    
    return `/dashboard/customer-threads/${fr.company_id}`
  }

  // Format date for display
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Get source label
  const getSourceLabel = (source: string): string => {
    if (source === 'meeting') return 'Meeting'
    if (source === 'email') return 'Mail'
    if (source === 'thread') return 'Mail'
    return 'Unknown'
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

          {/* Feature Requests Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Feature Requests</h3>
            <div className="space-y-4">
              {featureRequests.length === 0 ? (
                <div className="text-gray-500">No feature requests found.</div>
              ) : (
                featureRequests.map((fr) => {
                  const url = getFeatureRequestUrl(fr)
                  const sourceLabel = getSourceLabel(fr.source)
                  
                  return (
                    <Link
                      key={fr.id}
                      href={url}
                      className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all cursor-pointer hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-semibold text-gray-900 text-base flex-1">{fr.title}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* Company Name Badge */}
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {fr.company_name}
                        </span>
                        {/* Date Badge */}
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                          {formatDate(fr.requested_at)}
                        </span>
                        {/* Source Badge */}
                        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                          fr.source === 'meeting' 
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {sourceLabel}
                        </span>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
