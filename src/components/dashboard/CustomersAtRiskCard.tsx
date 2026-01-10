import { createClient } from '@/lib/supabase/server'
import { AlertTriangle, Bell } from 'lucide-react'

export default async function CustomersAtRiskCard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let percentage = 0
  
  if (user) {
    // Get total active companies count (excludes archived/deleted)
    const { count: totalActiveCount, error: totalError } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('status', 'archived')
      .neq('status', 'deleted')
    
    // Get companies with health_score < 0 (customers at risk)
    const { count: atRiskCount, error: atRiskError } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('status', 'archived')
      .neq('status', 'deleted')
      .lt('health_score', 0)
    
    if (!totalError && !atRiskError && totalActiveCount !== null && atRiskCount !== null && totalActiveCount > 0) {
      percentage = Math.round((atRiskCount / totalActiveCount) * 100)
    }
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        Customers At Risk
      </h3>
      <div className="flex items-center gap-3 flex-1">
        <div className="flex items-center gap-1 flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-500" />
          <Bell className="w-5 h-5 text-rose-600 dark:text-rose-500" />
        </div>
        <div>
          <span className="text-3xl font-bold text-rose-600 dark:text-rose-500">
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  )
}

