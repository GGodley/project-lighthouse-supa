import { createClient } from '@/lib/supabase/server'
import { Smile } from 'lucide-react'

export default async function HappyCustomersCard() {
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
      const happyCount = allCustomers?.filter(c => c.health_score && c.health_score > 0).length || 0
      percentage = Math.round((happyCount / totalCount) * 100)
    }
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        Happy Customers
      </h3>
      <div className="flex items-center gap-3 flex-1">
        <Smile className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <div>
          <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {percentage}%
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Positive</p>
        </div>
      </div>
    </div>
  )
}

