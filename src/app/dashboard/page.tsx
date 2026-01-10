import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users, TrendingUp, AlertTriangle, Calendar } from 'lucide-react';
import ConsiderTouchingBase from '@/components/ConsiderTouchingBase';

export const dynamic = 'force-dynamic'

// StatCard Component (Inline)
const StatCard = ({ 
  title, 
  value, 
  icon: Icon 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
}) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
    </div>
    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
      <Icon className="w-5 h-5" />
    </div>
  </div>
);

// Client component for meetings list (needs interactivity)
import DashboardMeetingsList from '@/components/dashboard/DashboardMeetingsList';
import DashboardTasksList from '@/components/dashboard/DashboardTasksList';
import DashboardRecentThreads from '@/components/dashboard/DashboardRecentThreads';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    redirect('/login');
  }

  // Get user's full name for greeting
  let fullName = 'there';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  
  if (profile?.full_name) {
    fullName = profile.full_name;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Fetch stats data
  // 1. Total Active Customers (where status != 'archived')
  const { count: activeCustomersCount } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .or('status.is.null,status.neq.archived');

  // 2. Health Score Avg (avg health_score of active companies)
  const { data: activeCompanies } = await supabase
    .from('companies')
    .select('health_score')
    .or('status.is.null,status.neq.archived');

  const avgHealthScore = activeCompanies && activeCompanies.length > 0
    ? Math.round(
        activeCompanies
          .filter(c => c.health_score !== null)
          .reduce((sum, c) => sum + (c.health_score || 0), 0) / 
        activeCompanies.filter(c => c.health_score !== null).length
      )
    : 0;

  // 3. At Risk (health_score < 50 OR status = 'churn_risk', excluding archived)
  const { data: allCompanies } = await supabase
    .from('companies')
    .select('status, health_score')
    .or('status.is.null,status.neq.archived');
  
  const atRiskCount = allCompanies?.filter(c => 
    c.status === 'churn_risk' || (c.health_score !== null && c.health_score < 50)
  ).length || 0;

  // 4. Upcoming Meetings (today/tomorrow)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 2); // End of tomorrow

  const { count: upcomingMeetingsCount } = await supabase
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString());

  return (
    <div className="min-h-screen bg-gray-50/95 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold text-gray-900">
            {getGreeting()}, {fullName}
          </h1>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Active Customers" 
            value={activeCustomersCount || 0} 
            icon={Users}
          />
          <StatCard 
            title="Avg Health" 
            value={avgHealthScore} 
            icon={TrendingUp}
          />
          <StatCard 
            title="At Risk" 
            value={atRiskCount || 0} 
            icon={AlertTriangle}
          />
          <StatCard 
            title="Meetings Today" 
            value={upcomingMeetingsCount || 0} 
            icon={Calendar}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column (Activity Feed) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Meetings Widget */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Upcoming Meetings</h3>
                <DashboardMeetingsList />
              </div>
            </div>

            {/* Recent Threads Widget */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Threads</h3>
                <DashboardRecentThreads />
              </div>
            </div>
          </div>

          {/* Right Column (Action Items) */}
          <div className="space-y-8">
            {/* Priority Tasks Widget */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Priority Tasks</h3>
                <DashboardTasksList />
              </div>
            </div>

            {/* Needs Attention Widget */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Needs Attention</h3>
                <ConsiderTouchingBase />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
