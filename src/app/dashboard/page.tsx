import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users, ArrowUp, ArrowDown } from 'lucide-react'
import { LucideIcon } from 'lucide-react'
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
      // Note: clients variable removed as it's no longer used

      // Fetch feature requests
      // First, get all active company IDs for this user (exclude archived/deleted)
      console.log(`[Dashboard] Fetching companies for user: ${user.id}`)
      const { data: allUserCompanies, error: companiesError } = await supabase
        .from('companies')
        .select('company_id, company_name, status')
        .eq('user_id', user.id)

      if (companiesError) {
        console.error(`[Dashboard] Error fetching companies:`, companiesError)
      }

      console.log(`[Dashboard] Found ${allUserCompanies?.length || 0} total companies for user`)
      if (allUserCompanies && allUserCompanies.length > 0) {
        console.log(`[Dashboard] Company statuses:`, allUserCompanies.map(c => ({ id: c.company_id, name: c.company_name, status: c.status })))
      }

      // Filter out archived and deleted companies
      const userCompanies = (allUserCompanies || []).filter(
        company => company.status !== 'archived' && company.status !== 'deleted'
      )

      console.log(`[Dashboard] Active companies (after filtering): ${userCompanies.length}`)

      if (userCompanies && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.company_id)
        const companyMap = new Map(userCompanies.map(c => [c.company_id, c.company_name]))
        
        // Validate company IDs
        if (companyIds.length === 0) {
          console.warn(`[Dashboard] No company IDs to query!`)
        } else if (companyIds.some(id => !id)) {
          console.warn(`[Dashboard] Some company IDs are null/undefined:`, companyIds)
        }
        
        // Fetch feature requests directly (no JOIN with features table)
        console.log(`[Dashboard] Querying feature_requests for ${companyIds.length} companies:`, companyIds)
        
        const { data: featureRequestsData, error: featureRequestsError } = await supabase
          .from('feature_requests')
          .select(`
            id,
            company_id,
            feature_id,
            request_details,
            requested_at,
            source,
            email_id,
            meeting_id,
            thread_id,
            urgency,
            completed,
            owner
          `)
          .in('company_id', companyIds)
          .not('company_id', 'is', null)
          .order('requested_at', { ascending: false })
          .limit(50)

        if (featureRequestsError) {
          console.error(`[Dashboard] Error fetching feature requests:`, featureRequestsError)
        }

        if (featureRequestsData && featureRequestsData.length > 0) {
          console.log(`[Dashboard] Found ${featureRequestsData.length} feature requests`)
          console.log(`[Dashboard] Sample feature request:`, featureRequestsData[0])
          
          // Transform feature requests data
          const transformed = featureRequestsData
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

              // Use request_details as title, or truncate if too long
              const title = fr.request_details 
                ? (fr.request_details.length > 100 
                    ? fr.request_details.substring(0, 100) + '...' 
                    : fr.request_details)
                : 'Feature Request'

              return {
                id: fr.id,
                title: title,
                company_name: companyMap.get(fr.company_id) || 'Unknown Company',
                company_id: fr.company_id,
                requested_at: fr.requested_at,
                source: (fr.source || 'thread') as 'email' | 'meeting' | 'thread',
                source_id: sourceId,
                urgency: (fr.urgency || 'Low') as 'Low' | 'Medium' | 'High',
                completed: fr.completed || false,
                first_requested: null, // Not available without features table
                last_requested: null, // Not available without features table
                owner: fr.owner || null,
                meeting_id: fr.meeting_id
              }
            })
            
          featureRequests = transformed
          console.log(`[Dashboard] Final feature requests count: ${featureRequests.length}`)
          if (featureRequests.length > 0) {
            console.log(`[Dashboard] Sample final feature request:`, featureRequests[0])
          }
        } else {
          console.log(`[Dashboard] No feature requests found for ${companyIds.length} companies`)
          console.log(`[Dashboard] Company IDs queried:`, companyIds)
          
          // Debug: Check if there are ANY feature requests in the database
          const { data: allFeatureRequests, error: allError } = await supabase
            .from('feature_requests')
            .select('id, company_id, feature_id, source')
            .limit(10)
          
          if (allError) {
            console.error(`[Dashboard] Error checking all feature requests:`, allError)
          } else {
            console.log(`[Dashboard] Total feature requests in database (sample):`, allFeatureRequests?.length || 0)
            if (allFeatureRequests && allFeatureRequests.length > 0) {
              console.log(`[Dashboard] Sample feature request company_ids:`, allFeatureRequests.map(fr => fr.company_id))
              console.log(`[Dashboard] User company IDs:`, companyIds)
              console.log(`[Dashboard] Do any match user companies?`, allFeatureRequests.some(fr => companyIds.includes(fr.company_id)))
              
              // Check which companies have feature requests
              const frCompanyIds = [...new Set(allFeatureRequests.map(fr => fr.company_id))]
              console.log(`[Dashboard] Companies with feature requests:`, frCompanyIds)
              console.log(`[Dashboard] Intersection:`, frCompanyIds.filter(id => companyIds.includes(id)))
              
              // Check if any feature requests belong to user's companies but weren't found
              const matchingFRs = allFeatureRequests.filter(fr => companyIds.includes(fr.company_id))
              if (matchingFRs.length > 0) {
                console.error(`[Dashboard] CRITICAL: Found ${matchingFRs.length} feature requests that SHOULD have been returned!`)
                console.error(`[Dashboard] Matching feature requests:`, matchingFRs)
              }
            } else {
              console.warn(`[Dashboard] No feature requests exist in database at all`)
            }
          }
        }
      } else {
        console.warn(`[Dashboard] No active companies found for user ${user.id}. Cannot fetch feature requests.`)
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

      // Count healthy and at-risk customers from non-archived companies
      // First get active company IDs, then query customers to ensure we exclude archived companies
      let healthyCustomersCount = 0
      let atRiskCustomersCount = 0
      try {
        // Get active company IDs (non-archived) for this user
        const { data: allUserCompanies } = await supabase
          .from('companies')
          .select('company_id, status')
          .eq('user_id', user.id)

        const activeCompanyIds = (allUserCompanies || [])
          .filter(company => company.status !== 'archived')
          .map(company => company.company_id)

        if (activeCompanyIds.length > 0) {
          // Query customers with health_score > 0 (Healthy) from active companies
          // Exclude NULL health_score values
          const { data: healthyCustomers, error: healthyError } = await supabase
            .from('customers')
            .select('customer_id, health_score')
            .in('company_id', activeCompanyIds)
            .not('health_score', 'is', null)
            .gt('health_score', 0)

          if (healthyError) {
            console.error('Error fetching healthy customers:', healthyError)
          } else {
            healthyCustomersCount = healthyCustomers?.length || 0
          }

          // Query customers with health_score < 0 (At Risk) from active companies
          // Exclude NULL health_score values
          const { data: atRiskCustomers, error: atRiskError } = await supabase
            .from('customers')
            .select('customer_id, health_score')
            .in('company_id', activeCompanyIds)
            .not('health_score', 'is', null)
            .lt('health_score', 0)

          if (atRiskError) {
            console.error('Error fetching at-risk customers:', atRiskError)
          } else {
            atRiskCustomersCount = atRiskCustomers?.length || 0
          }
        }
      } catch (error) {
        console.error('Error fetching customer counts:', error)
      }

      stats = {
        totalClients: atRiskCustomersCount,
        activeClients: healthyCustomersCount,
        upcomingMeetings: 0,
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

  // Define types for stat cards
  type StatCardWithIcon = {
    title: string
    value: number
    icon: LucideIcon
    color: string
    change: string
    trend?: 'up' | 'down' | 'neutral'
  }

  type StatCardWithEmoji = {
    title: string
    value: number
    icon: string
    iconType: 'emoji'
    color: string
    iconColor: string
    change: string
    trend?: 'up' | 'down' | 'neutral'
  }

  type StatCard = StatCardWithIcon | StatCardWithEmoji

  const statCards: StatCard[] = [
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'bg-blue-500',
      change: formatPercentageChange(stats.customerCountChange),
      trend: stats.customerCountTrend
    },
    {
      title: 'At Risk Customers',
      value: stats.totalClients,
      icon: '😟',
      iconType: 'emoji',
      color: 'bg-red-50',
      iconColor: 'text-red-600',
      change: '+12%'
    },
    {
      title: 'Healthy Customers',
      value: stats.activeClients,
      icon: '😊',
      iconType: 'emoji',
      color: 'bg-green-50',
      iconColor: 'text-green-600',
      change: '+8%'
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
                  {'iconType' in stat && stat.iconType === 'emoji' ? (
                    <span className={`text-2xl ${stat.iconColor}`}>{stat.icon}</span>
                  ) : (() => {
                    const iconCard = stat as StatCardWithIcon
                    const IconComponent = iconCard.icon
                    return <IconComponent className="w-6 h-6 text-white" />
                  })()}
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

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
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
