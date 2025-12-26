import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import TotalCustomersCard from '@/components/dashboard/TotalCustomersCard'
import HappyCustomersCard from '@/components/dashboard/HappyCustomersCard'
import CustomersAtRiskCard from '@/components/dashboard/CustomersAtRiskCard'
import UpcomingMeetings from '@/components/dashboard/UpcomingMeetings'
import TasksNextSteps from '@/components/dashboard/TasksNextSteps'
import ConsiderTouchingBase from '@/components/ConsiderTouchingBase'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient();

  // Auth check
    const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
      redirect('/login');
  }

  return (
    <div className="min-h-screen glass-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Bento-box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Row 1: Welcome Banner (span 2) + Total Customers (span 1) */}
          <div className="md:col-span-2">
            <WelcomeBanner />
            </div>
          <div className="md:col-span-1">
            <TotalCustomersCard />
          </div>

          {/* Row 2: Happy Customers + Customers At Risk + Upcoming Meetings (tall) */}
          <div className="md:col-span-1">
            <HappyCustomersCard />
                </div>
          <div className="md:col-span-1">
            <CustomersAtRiskCard />
                </div>
          <div className="md:col-span-1 md:row-span-2">
            <UpcomingMeetings />
          </div>

          {/* Row 3: Tasks/Next Steps (span 2) + Consider Touching Base (span 1) */}
          <div className="md:col-span-2">
            <TasksNextSteps />
          </div>
          <div className="md:col-span-1">
            <ConsiderTouchingBase />
          </div>
        </div>
      </div>
    </div>
  )
}
