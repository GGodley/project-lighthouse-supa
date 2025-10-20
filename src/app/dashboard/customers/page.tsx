'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/SupabaseProvider'
import { MoreHorizontal } from 'lucide-react'


// Company type based on exact database schema
type Company = {
  company_id: string
  company_name: string | null
  health_score: number | null
  overall_sentiment: string | null
  status: string | null
  mrr: number | null
  renewal_date: string | null
  last_interaction_at: string | null
  created_at: string | null
}

// Main Company Dashboard Component
const CustomersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  // Helper functions
  const convertScoreToPercentage = (score: number | null): number => {
    if (score === null || score === undefined) return 0;
    const baselinePercent = 70;
    const maxScore = 10;
    const minScore = -10;

    if (score >= maxScore) return 100;
    if (score <= minScore) return 0;

    if (score > 0) {
      const percentPerPoint = (100 - baselinePercent) / maxScore;
      return Math.round(baselinePercent + (score * percentPerPoint));
    }
    if (score < 0) {
      const percentPerPoint = (baselinePercent - 0) / Math.abs(minScore);
      return Math.round(baselinePercent + (score * percentPerPoint));
    }
    return baselinePercent;
  };

  const formatMRR = (mrr: number | null) => {
    if (mrr === null || mrr === undefined) return 'Not set';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(mrr);
  };

  const statusPillStyles: { [key: string]: string } = {
    'Healthy': 'bg-green-100 text-green-800',
    'At Risk': 'bg-red-100 text-red-800',
    'Needs Attention': 'bg-yellow-100 text-yellow-800',
  };

  const scoreTextStyles = (percent: number): string => {
    if (percent >= 70) return 'text-green-600';
    if (percent >= 40) return 'text-orange-500';
    return 'text-red-600';
  };

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true)

        // Fetch via server API route to avoid client-side RLS pitfalls
        const resp = await fetch('/api/customers', { cache: 'no-store' })
        if (!resp.ok) {
          const msg = await resp.text()
          setError(msg || 'Failed to fetch companies')
          return
        }
        const json = await resp.json()
        setCompanies((json.companies as Company[]) || [])
      } catch (err) {
        console.error('Error:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCompanies()
  }, [supabase])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
            <p className="text-sm text-gray-500 mt-1">
              <a href="/dashboard" className="hover:underline">Dashboard</a> / <span className="font-medium">Companies</span>
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <input type="text" placeholder="Search companies..." className="px-4 py-2 border rounded-md text-sm" />
            <button className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700">
              + Add Company
            </button>
          </div>
        </header>

        {/* Company Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800">Company Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="p-4"><input type="checkbox" className="rounded" /></th>
                  <th scope="col" className="px-6 py-3">Company Name</th>
                  <th scope="col" className="px-6 py-3">Health Score</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">MRR</th>
                  <th scope="col" className="px-6 py-3">Renewal Date</th>
                  <th scope="col" className="px-6 py-3">Last Interaction</th>
                  <th scope="col" className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center p-8">Loading companies...</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="text-center p-8 text-red-500">{error}</td></tr>
                ) : companies.length === 0 ? (
                  <tr><td colSpan={8} className="text-center p-8 text-gray-500">No companies found. Companies will appear here after email sync.</td></tr>
                ) : (
                  companies.map((company, index) => {
                    const displayPercent = convertScoreToPercentage(company.health_score);
                    return (
                      <tr key={index} className="bg-white border-b hover:bg-gray-50">
                        <td className="p-4"><input type="checkbox" className="rounded" /></td>
                        <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap">
                          <Link 
                            href={`/dashboard/customers/${company.company_id}`} 
                            className="hover:text-purple-600 transition-colors"
                          >
                            {company.company_name}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center">
                            <span className={`w-12 font-medium ${scoreTextStyles(displayPercent)}`}>
                              {displayPercent}%
                            </span>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 ml-2">
                              <div
                                className={`h-1.5 rounded-full ${displayPercent >= 70 ? 'bg-green-500' : displayPercent >= 40 ? 'bg-orange-500' : 'bg-red-500'}`}
                                style={{ width: `${displayPercent}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            statusPillStyles[company.overall_sentiment || ''] || 'bg-gray-100 text-gray-800'
                          }`}>
                            {company.overall_sentiment || 'Not set'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          <span>{formatMRR(company.mrr)}</span>
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {company.renewal_date ? (
                            new Date(company.renewal_date).toLocaleDateString('en-CA')
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {company.last_interaction_at ? (
                            new Date(company.last_interaction_at).toLocaleDateString('en-CA')
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button className="text-gray-500 hover:text-gray-800">
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default CustomersSection



