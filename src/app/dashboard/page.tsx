import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users, Calendar, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react'
import SyncEmailsButton from '@/components/SyncEmailsButton'
import ConsiderTouchingBase from '@/components/ConsiderTouchingBase'
import FeatureRequestsSection from '@/components/FeatureRequestsSection'
import HealthDistributionChart from '@/components/HealthDistributionChart'

export const dynamic = 'force-dynamic'

interface DashboardStats {
  totalClients: number
  activeClients: number
  upcomingMeetings: number
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
  urgency: 'Low' | 'Medium' | 'High'
  completed: boolean
  first_requested: string | null
  last_requested: string | null
  owner: string | null
  meeting_id: number | null
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
    totalCustomers: 0,
    customerCountChange: null,
    customerCountTrend: 'neutral'
  }
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

      // Fetch feature requests
      // First, get all active company IDs for this user (exclude archived/deleted)
      const { data: allUserCompanies } = await supabase
        .from('companies')
        .select('company_id, company_name, status')
        .eq('user_id', user.id)

      // Filter out archived and deleted companies
      const userCompanies = (allUserCompanies || []).filter(
        company => company.status !== 'archived' && company.status !== 'deleted'
      )

      if (userCompanies && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.company_id)
        const companyMap = new Map(userCompanies.map(c => [c.company_id, c.company_name]))
        
        // Fetch feature requests
        const { data: featureRequestsData } = await supabase
          .from('feature_requests')
          .select('id, company_id, feature_id, requested_at, source, email_id, meeting_id, thread_id, urgency, completed, owner')
          .in('company_id', companyIds)
          .limit(50)

        if (featureRequestsData && featureRequestsData.length > 0) {
          // Get unique feature IDs
          const featureIds = [...new Set(featureRequestsData.map(fr => fr.feature_id))]
          
          // Fetch features
          const { data: featuresData } = await supabase
            .from('features')
            .select('id, title, first_requested, last_requested')
            .in('id', featureIds)

          if (featuresData) {
            const featuresMap = new Map(featuresData.map(f => [f.id, {
              title: f.title,
              first_requested: f.first_requested,
              last_requested: f.last_requested
            }]))
            
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

                const feature = featuresMap.get(fr.feature_id)

                return {
                  id: fr.id,
                  title: feature?.title || 'Unknown Feature',
                  company_name: companyMap.get(fr.company_id) || 'Unknown Company',
                  company_id: fr.company_id,
                  requested_at: fr.requested_at,
                  source: (fr.source || 'thread') as 'email' | 'meeting' | 'thread',
                  source_id: sourceId,
                  urgency: (fr.urgency || 'Low') as 'Low' | 'Medium' | 'High',
                  completed: fr.completed || false,
                  first_requested: feature?.first_requested || null,
                  last_requested: feature?.last_requested || null,
                  owner: fr.owner || null,
                  meeting_id: fr.meeting_id
                }
              })
              .filter(fr => fr.title !== 'Unknown Feature') // Filter out any with missing features
          }
        }
      }

      // Fetch company count data directly from database (server-side)
      // This matches the logic in the customer threads table
      let customerData = {
        currentCount: 0,
        percentageChange: null as number | null,
        trend: 'neutral' as 'up' | 'down' | 'neutral'
      }

      try {
        // Get current active company count (excluding archived/deleted)
        // This matches the customer threads table which filters out archived companies
        const { data: allCompanies } = await supabase
          .from('companies')
          .select('company_id, status')
          .eq('user_id', user.id)

        // Filter out archived companies (keep NULL and all other statuses)
        // This matches the logic in /api/customers route
        const activeCompanies = (allCompanies || []).filter(
          company => company.status !== 'archived'
        )

        const currentCount = activeCompanies.length

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

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
            <ConsiderTouchingBase />
        </div>

            <div className="lg:col-span-2">
              <HealthDistributionChart />
            </div>
          </div>

          {/* Feature Requests Section */}
          <FeatureRequestsSection featureRequests={featureRequests} />
        </div>
      </div>
    </div>
  )
}
