import { createClient } from '@/lib/supabase/server'
import { AlertTriangle, Bell } from 'lucide-react'

export default async function CustomersAtRiskCard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let percentage = 0
  
  if (user) {
    // Get all customers for this user
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('health_score')
      .eq('user_id', user.id)
      .not('health_score', 'is', null)
    
    const totalCount = allCustomers?.length || 0
    
    if (totalCount > 0) {
      const atRiskCount = allCustomers?.filter(c => c.health_score && c.health_score < 0).length || 0
      percentage = Math.round((atRiskCount / totalCount) * 100)
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

