'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TouchingBaseWidget } from '@/components/dashboard/TouchingBaseWidget'
import { Loader2 } from 'lucide-react'

interface Customer {
  customer_id: string
  full_name: string | null
  email: string
  company_id: string
  company_name: string | null
  domain_name: string | null
  last_interaction_at: string | null
}

interface TouchingBaseResponse {
  customers: Customer[]
  totalCount: number
}

export function TouchingBaseWidgetContainer() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchTouchingBaseCustomers = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch customers not contacted in > 30 days (using the existing API)
        const resp = await fetch('/api/customers/touching-base?days=30', { cache: 'no-store' })
        if (!resp.ok) {
          const msg = await resp.text()
          setError(msg || 'Failed to fetch customers')
          return
        }
        const json: TouchingBaseResponse = await resp.json()
        setCustomers(json.customers || [])
      } catch (err) {
        console.error('Error fetching touching base customers:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTouchingBaseCustomers()
  }, [])

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

  // Create a map to store company IDs for navigation
  const companyIdMap = new Map<string, string>()
  customers.forEach(customer => {
    companyIdMap.set(customer.customer_id, customer.company_id)
  })

  // Transform API data to widget format
  const candidates = customers.map(customer => ({
    id: customer.customer_id,
    name: customer.full_name || customer.email || 'Unnamed Customer',
    company: customer.company_name || 'No Company',
    lastContactDate: customer.last_interaction_at || customer.created_at || new Date().toISOString(),
    avatarUrl: customer.domain_name ? `https://unavatar.io/${customer.domain_name}` : undefined,
  }))

  return (
    <TouchingBaseWidget 
      candidates={candidates}
      onCandidateClick={(candidateId) => {
        const companyId = companyIdMap.get(candidateId)
        if (companyId) {
          router.push(`/dashboard/customer-threads/${companyId}`)
        }
      }}
    />
  )
}

