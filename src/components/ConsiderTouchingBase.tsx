'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, XCircle, Building2, ArrowRight } from 'lucide-react'
import CompanyAvatar from '@/components/ui/CompanyAvatar'

// Customer type matching the API response
type Customer = {
  customer_id: string
  full_name: string | null
  email: string
  company_id: string
  company_name: string | null
  domain_name: string | null
  health_score: number | null
  overall_sentiment: string | null
  last_interaction_at: string | null
  created_at: string | null
}

interface TouchingBaseResponse {
  customers: Customer[]
  totalCount: number
}

type TimePeriod = {
  label: string
  days: number
}

const TIME_PERIODS: TimePeriod[] = [
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '>2 months', days: 60 },
]

const ConsiderTouchingBase: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number>(30) // Default to 1 month

  useEffect(() => {
    const fetchTouchingBaseCustomers = async () => {
      try {
        setLoading(true)
        setError(null)

        const resp = await fetch(`/api/customers/touching-base?days=${selectedDays}`, { cache: 'no-store' })
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
  }, [selectedDays])

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
        Consider Touching Base
      </h3>
      
      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TIME_PERIODS.map((period) => {
          const isSelected = selectedDays === period.days
          return (
            <button
              key={`period-${period.days}`}
              onClick={() => setSelectedDays(period.days)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300 opacity-60'
              }`}
            >
              {period.label}
            </button>
          )
        })}
      </div>

      {/* Customer List */}
      <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '20rem' }}>
        {loading ? (
          <div className="text-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading customers...</p>
          </div>
        ) : error ? (
          <div className="text-center p-8">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center p-8">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50 text-gray-400 dark:text-gray-500" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">All caught up!</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No customers need touching base at this time.</p>
          </div>
        ) : (
          customers.map((customer, index) => (
            <Link
              key={customer.customer_id || index}
              href={`/dashboard/customer-threads/${customer.company_id}`}
              className="block"
            >
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-slate-700/60 border border-white/20 dark:border-slate-600/20 shadow-sm transition-all hover:scale-[1.01] hover:shadow-md hover:bg-white/80 dark:hover:bg-slate-700/80 cursor-pointer">
                {/* Company Avatar */}
                <CompanyAvatar domain={customer.domain_name || ''} name={customer.company_name} />
                
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                    {customer.full_name || customer.email || 'Unnamed Customer'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {customer.company_name || 'No Company'}
                  </p>
                </div>
                
                {/* Arrow */}
                <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

export default ConsiderTouchingBase

