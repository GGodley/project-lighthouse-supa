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

        // Fetch all companies first, then filter out archived in JavaScript to handle NULL properly
        const { data: allCompanies, error: fetchError } = await supabase
          .from('companies')
          .select('company_id, company_name, last_interaction_at, status')
          .eq('user_id', user.id)

        if (fetchError) throw fetchError

        // Filter out archived companies (keep NULL and all other statuses)
        const activeCompanies = (allCompanies || []).filter(
          company => company.status !== 'archived' && company.status !== 'deleted'
        )

        // Sort by last_interaction_at (oldest first, nulls first)
        const sortedCompanies = activeCompanies.sort((a, b) => {
          if (!a.last_interaction_at && !b.last_interaction_at) return 0
          if (!a.last_interaction_at) return -1
          if (!b.last_interaction_at) return 1
          return new Date(a.last_interaction_at).getTime() - new Date(b.last_interaction_at).getTime()
        })

        setCompanies(sortedCompanies.map(c => ({
          company_id: c.company_id,
          company_name: c.company_name,
          last_interaction_at: c.last_interaction_at
        })))
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
