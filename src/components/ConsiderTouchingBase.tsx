'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, XCircle, Building2 } from 'lucide-react'
import HealthScoreBar from '@/components/ui/HealthScoreBar'

// Company type matching the API response
type Company = {
  company_id: string
  company_name: string | null
  domain_name: string
  health_score: number | null
  overall_sentiment: string | null
  status: string | null
  mrr: number | null
  renewal_date: string | null
  last_interaction_at: string | null
  created_at: string | null
}

interface TouchingBaseResponse {
  companies: Company[]
  totalCount: number
}

type TimePeriod = {
  label: string
  days: number
}

const TIME_PERIODS: TimePeriod[] = [
  { label: '1 Week', days: 7 },
  { label: '2 Weeks', days: 14 },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 },
]

const ConsiderTouchingBase: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number>(30) // Default to 30 days (1 month)

  useEffect(() => {
    const fetchTouchingBaseCompanies = async () => {
      try {
        setLoading(true)
        setError(null)

        const resp = await fetch(`/api/customers/touching-base?days=${selectedDays}`, { cache: 'no-store' })
        if (!resp.ok) {
          const msg = await resp.text()
          setError(msg || 'Failed to fetch companies')
          return
        }
        const json: TouchingBaseResponse = await resp.json()
        setCompanies(json.companies || [])
      } catch (err) {
        console.error('Error fetching touching base companies:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTouchingBaseCompanies()
  }, [selectedDays])

  const statusPillStyles: { [key: string]: string } = {
    'Healthy': 'bg-green-50 text-green-700 border border-green-200',
    'At Risk': 'bg-red-50 text-red-700 border border-red-200',
    'Neutral': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'Needs Attention': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    // Sentiment values
    'Positive': 'bg-green-50 text-green-700 border border-green-200',
    'Very Positive': 'bg-green-50 text-green-700 border border-green-200',
    'Negative': 'bg-red-50 text-red-700 border border-red-200',
    'Very Negative': 'bg-red-50 text-red-700 border border-red-200',
  }

  const getDescriptionText = (days: number) => {
    if (days === 7) return "Companies that haven't had an interaction in 1 week"
    if (days === 14) return "Companies that haven't had an interaction in 2+ weeks"
    if (days === 30) return "Companies that haven't had an interaction in 1 month"
    if (days === 60) return "Companies that haven't had an interaction in 2 months"
    return `Companies that haven't had an interaction in ${days} days`
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Consider Touching Base</h2>
        <p className="text-sm text-gray-600 mt-1">
          {getDescriptionText(selectedDays)}
        </p>
        
        {/* Time Period Pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {TIME_PERIODS.map((period) => {
            const isSelected = selectedDays === period.days
            const handleClick = () => {
              setSelectedDays(period.days)
            }
            return (
              <button
                key={`period-${period.days}`}
                onClick={handleClick}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {period.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-h-[450px] overflow-y-auto">
        <table className="glass-table w-full text-sm text-left rounded-xl">
            <thead className="glass-table-header sticky top-0 z-10">
              <tr className="bg-inherit">
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Company Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Health Score
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Last Interaction
                </th>
              </tr>
            </thead>
            <tbody className="space-y-2">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-gray-600">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p>Loading companies...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-red-600">
                    <XCircle className="h-6 w-6 mx-auto mb-2" />
                    <p>{error}</p>
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-gray-500">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm mt-2">No companies need touching base at this time.</p>
                  </td>
                </tr>
              ) : (
                companies.map((company, index) => (
                  <tr key={company.company_id || index} className="glass-bar-row">
                    <td className="px-6 py-5">
                      <Link 
                        href={`/dashboard/customer-threads/${company.company_id}`} 
                        className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-base"
                      >
                        {company.company_name || 'Unnamed Company'}
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      <HealthScoreBar score={company.health_score} showLabel={true} />
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                        statusPillStyles[company.overall_sentiment || ''] || 'bg-gray-100 text-gray-800'
                      }`}>
                        {company.overall_sentiment || 'Not set'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-gray-600">
                      {company.last_interaction_at ? (
                        new Date(company.last_interaction_at).toLocaleDateString('en-CA')
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </div>
    </div>
  )
}

export default ConsiderTouchingBase

