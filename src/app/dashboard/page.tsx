import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardMeetingsListWithCards from '@/components/dashboard/DashboardMeetingsListWithCards';
import DashboardTasksList from '@/components/dashboard/DashboardTasksList';

export const dynamic = 'force-dynamic'

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
    const nameParts = profile.full_name.split(' ');
    if (nameParts.length > 0) {
      fullName = nameParts[0]; // Use first name only
    } else {
      fullName = profile.full_name;
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Fetch all companies to calculate stats
  const { data: allCompaniesData } = await supabase
    .from('companies')
    .select('status, health_score')
    .eq('user_id', user.id);

  // Filter to active companies (not archived or deleted)
  const activeCompanies = (allCompaniesData || []).filter(c => 
    !['archived', 'deleted'].includes(c.status || '')
  );

  // Calculate stats from active companies
  const totalActive = activeCompanies.length;
  const atRiskCount = activeCompanies.filter(c => 
    (c.health_score !== null && c.health_score < 0)
  ).length;
  const happyCount = activeCompanies.filter(c => 
    (c.health_score !== null && c.health_score > 50)
  ).length;

  // Calculate percentages
  const atRiskPercentage = totalActive > 0 ? Math.round((atRiskCount / totalActive) * 100) : 0;
  const happyPercentage = totalActive > 0 ? Math.round((happyCount / totalActive) * 100) : 0;

  // Fetch today's meetings count
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
    <main className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {fullName}
        </h1>
        <p className="text-gray-500 mt-1">
          Here is what is happening with your customers today.
        </p>
      </header>

      {/* ROW 1: STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Customers */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase">Active Customers</p>
          <div className="flex items-end justify-between mt-2">
            <h3 className="text-3xl font-bold text-gray-900">{totalActive}</h3>
            <span className="text-gray-400 mb-1 text-sm">Total</span>
          </div>
        </div>

        {/* Happy Customers */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase">Happy Customers</p>
          <div className="flex items-end justify-between mt-2">
            <h3 className="text-3xl font-bold text-green-600">{happyPercentage}%</h3>
            <span className="text-xs font-medium bg-green-50 text-green-600 px-2 py-1 rounded-full">Positive</span>
          </div>
        </div>

        {/* At Risk */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase">At Risk</p>
          <div className="flex items-end justify-between mt-2">
            <h3 className="text-3xl font-bold text-red-600">{atRiskPercentage}%</h3>
            <span className="text-xs font-medium bg-red-50 text-red-600 px-2 py-1 rounded-full">Score &lt; 0</span>
          </div>
        </div>

        {/* Meetings Today */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase">Meetings Today</p>
          <div className="flex items-end justify-between mt-2">
            <h3 className="text-3xl font-bold text-gray-900">{upcomingMeetingsCount || 0}</h3>
            <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2 py-1 rounded-full">Scheduled</span>
          </div>
        </div>
      </div>

      {/* ROW 2: CONTENT SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Upcoming Meetings (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Meetings</h2>
          <DashboardMeetingsListWithCards />
        </div>

        {/* Right: Priority Tasks (1/3 width) */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-gray-900">Priority Tasks</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6">
              <DashboardTasksList />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
