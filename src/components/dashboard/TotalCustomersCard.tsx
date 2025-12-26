import { createClient } from '@/lib/supabase/server'
import { ArrowUp } from 'lucide-react'

export default async function TotalCustomersCard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let totalCustomers = 0
  
  if (user) {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('company_id', { count: 'exact', head: false })
      .eq('user_id', user.id)
    
    if (!error && companies) {
      totalCustomers = companies.length
    }
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        Total Customers
      </h3>
      <div className="flex items-center gap-2">
        <span className="text-4xl font-bold text-slate-800 dark:text-white">
          {totalCustomers}
        </span>
        <ArrowUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      </div>
    </div>
  )
}

