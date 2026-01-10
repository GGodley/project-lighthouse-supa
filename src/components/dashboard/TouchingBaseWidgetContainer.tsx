'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { TouchingBaseWidget } from '@/components/dashboard/TouchingBaseWidget'
import { Loader2 } from 'lucide-react'

interface CompanyCandidate {
  company_id: string
  company_name: string
  last_interaction_at: string | null
}

export function TouchingBaseWidgetContainer() {
  const [companies, setCompanies] = useState<CompanyCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Fetch active companies with last_interaction_at
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('company_id, company_name, last_interaction_at')
          .eq('user_id', user.id)
          .or('status.is.null,status.neq.archived,status.neq.deleted')
          .order('last_interaction_at', { ascending: true, nullsFirst: true })

        if (fetchError) throw fetchError

        setCompanies(data || [])
      } catch (err) {
        console.error('Error fetching companies:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCompanies()
  }, [supabase])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Consider Touching Base</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Consider Touching Base</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return <TouchingBaseWidget companies={companies} />
}
