import { createClient } from '@/lib/supabase/server'
import { ArrowUp } from 'lucide-react'

export default async function TotalCustomersCard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let totalCustomers = 0
  
  if (user) {
    const { count, error } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      // Filter out archived and deleted companies
      .neq('status', 'archived')
      .neq('status', 'deleted')
    
    if (!error && count !== null) {
      totalCustomers = count
    }
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col justify-between">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        Total Customers
      </h3>
      <div className="flex items-center gap-2">
        <span className="text-4xl font-bold text-slate-800 dark:text-white">
          {totalCustomers}
        </span>
        <ArrowUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
      </div>
    </div>
  )
}

