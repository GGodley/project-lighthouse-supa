'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/SupabaseProvider'
import { MoreHorizontal, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { useThreadSync } from '@/hooks/useThreadSync'


// Company type based on exact database schema
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

// Main Company Dashboard Component
const CustomerThreadsPage: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerToken, setProviderToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const supabase = useSupabase()

  // Get auth session for provider token and user email
  useEffect(() => {
    const getAuthData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setProviderToken(session.provider_token || null)
        setUserEmail(session.user?.email || null)
      }
    }
    getAuthData()
  }, [supabase])

  // Thread sync hook
  const { syncStatus, syncDetails, startSync } = useThreadSync(providerToken, userEmail)

  // Trigger sync on page load
  useEffect(() => {
    if (providerToken && userEmail && syncStatus === 'idle') {
      // Check if there's already a running/pending job
      const checkExistingJob = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return

        const { data: existingJobs } = await supabase
          .from('sync_jobs')
          .select('id, status')
          .eq('user_id', session.user.id)
          .in('status', ['pending', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!existingJobs) {
          startSync()
        }
      }
      checkExistingJob()
    }
  }, [providerToken, userEmail, syncStatus, startSync, supabase])

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

  const renderSyncStatus = () => {
    if (syncStatus === 'idle') {
      return (
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span>Ready to sync</span>
        </div>
      )
    }

    if (syncStatus === 'creating_job' || syncStatus === 'syncing') {
      return (
        <div className="flex items-center space-x-2 text-sm text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{syncDetails || 'Syncing threads...'}</span>
        </div>
      )
    }

    if (syncStatus === 'completed') {
      return (
        <div className="flex items-center space-x-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>{syncDetails || 'Sync completed'}</span>
          <button
            onClick={() => startSync()}
            className="ml-2 text-blue-600 hover:text-blue-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )
    }

    if (syncStatus === 'failed') {
      return (
        <div className="flex items-center space-x-2 text-sm text-red-600">
          <XCircle className="h-4 w-4" />
          <span>{syncDetails || 'Sync failed'}</span>
          <button
            onClick={() => startSync()}
            className="ml-2 text-blue-600 hover:text-blue-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )
    }

    return null
  }

  // Bulk selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCompanies(companies.map(c => c.company_id))
    } else {
      setSelectedCompanies([])
    }
  }

  const handleSelectOne = (companyId: string, checked: boolean) => {
    if (checked) {
      setSelectedCompanies([...selectedCompanies, companyId])
    } else {
      setSelectedCompanies(selectedCompanies.filter(id => id !== companyId))
    }
  }

  // Bulk action handlers
  const handleArchiveSelected = async () => {
    if (selectedCompanies.length === 0) return

    const { error } = await supabase
      .from('companies')
      .update({ status: 'inactive' }) // Use 'inactive' instead of 'archived' (not in schema)
      .in('company_id', selectedCompanies)

    if (!error) {
      setSelectedCompanies([])
      // Refresh the list
      const resp = await fetch('/api/customers', { cache: 'no-store' })
      if (resp.ok) {
        const json = await resp.json()
        setCompanies((json.companies as Company[]) || [])
      }
    } else {
      console.error('Error archiving companies:', error)
      // TODO: Show toast error
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCompanies.length === 0) return

    // NOTE: Replace this with a proper modal component in the future
    if (window.confirm(`Are you sure you want to PERMANENTLY DELETE ${selectedCompanies.length} companies? Their domains will be added to the blocklist to prevent future imports. This action cannot be undone.`)) {
      try {
        // Get user ID for blocklist
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.error('Not authenticated')
          return
        }

        // Get the selected companies with their domain names
        const companiesToDelete = companies.filter(c => selectedCompanies.includes(c.company_id))
        const domainsToBlock = companiesToDelete.map(c => c.domain_name).filter(Boolean)

        // Add domains to blocklist before deleting companies
        if (domainsToBlock.length > 0) {
          const blocklistEntries = domainsToBlock.map(domain => ({
            user_id: user.id,
            domain: domain.toLowerCase()
          }))

          const { error: blocklistError } = await supabase
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - domain_blocklist table not yet in TypeScript types
            .from('domain_blocklist')
            .upsert(blocklistEntries, {
              onConflict: 'user_id, domain',
              ignoreDuplicates: false
            })

          if (blocklistError) {
            console.error('Error adding domains to blocklist:', blocklistError)
            // Continue with deletion even if blocklist fails
          } else {
            console.log(`✅ Added ${domainsToBlock.length} domain(s) to blocklist`)
          }
        }

        // Delete the companies
        const { error } = await supabase
          .from('companies')
          .delete()
          .in('company_id', selectedCompanies)

        if (!error) {
          setSelectedCompanies([])
          // Refresh the list
          const resp = await fetch('/api/customers', { cache: 'no-store' })
          if (resp.ok) {
            const json = await resp.json()
            setCompanies((json.companies as Company[]) || [])
          }
        } else {
          console.error('Error deleting companies:', error)
          // TODO: Show toast error
        }
      } catch (err) {
        console.error('Error in handleDeleteSelected:', err)
        // TODO: Show toast error
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Threads</h1>
            <p className="text-sm text-gray-500 mt-1">
              <a href="/dashboard" className="hover:underline">Dashboard</a> / <span className="font-medium">Customer Threads</span>
            </p>
            {/* Sync Status Display */}
            <div className="mt-2">
              {renderSyncStatus()}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <input type="text" placeholder="Search companies..." className="px-4 py-2 border rounded-md text-sm" />
            <button 
              onClick={() => startSync()}
              disabled={syncStatus === 'creating_job' || syncStatus === 'syncing'}
              className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Threads'}
            </button>
          </div>
        </header>

        {/* Company Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Company Overview</h2>
            
            {/* Bulk Actions - Always visible */}
            <div className="flex items-center space-x-3">
              {selectedCompanies.length > 0 && (
                <span className="text-sm font-semibold text-gray-700">
                  {selectedCompanies.length} selected
                </span>
              )}
              <button
                onClick={handleArchiveSelected}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={selectedCompanies.length === 0}
                title={selectedCompanies.length === 0 ? "Select companies to archive" : `Archive ${selectedCompanies.length} companies`}
              >
                Archive{selectedCompanies.length > 0 && ` (${selectedCompanies.length})`}
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={selectedCompanies.length === 0}
                title={selectedCompanies.length === 0 ? "Select companies to delete" : `Delete ${selectedCompanies.length} companies`}
              >
                Delete{selectedCompanies.length > 0 && ` (${selectedCompanies.length})`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="p-4">
                    <input 
                      type="checkbox" 
                      className="rounded" 
                      checked={companies.length > 0 && selectedCompanies.length === companies.length}
                      onChange={handleSelectAll}
                    />
                  </th>
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
                  <tr><td colSpan={8} className="text-center p-8 text-gray-500">No companies found. Companies will appear here after thread sync.</td></tr>
                ) : (
                  companies.map((company, index) => {
                    const displayPercent = convertScoreToPercentage(company.health_score);
                    const isSelected = selectedCompanies.includes(company.company_id);
                    return (
                      <tr key={index} className="bg-white border-b hover:bg-gray-50">
                        <td className="p-4">
                          <input 
                            type="checkbox" 
                            className="rounded" 
                            checked={isSelected}
                            onChange={(e) => handleSelectOne(company.company_id, e.target.checked)}
                          />
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap">
                          <Link 
                            href={`/dashboard/customer-threads/${company.company_id}`} 
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

export default CustomerThreadsPage

