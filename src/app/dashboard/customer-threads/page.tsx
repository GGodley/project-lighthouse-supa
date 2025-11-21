'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/SupabaseProvider'
import { MoreHorizontal, Loader2, CheckCircle2, XCircle, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react'
import { useThreadSync } from '@/hooks/useThreadSync'
import HealthScoreBar from '@/components/ui/HealthScoreBar'
import ProgressBar from '@/components/ui/ProgressBar'


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
  const [archivedCompanies, setArchivedCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerToken, setProviderToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [selectedArchivedCompanies, setSelectedArchivedCompanies] = useState<string[]>([])
  const [isMainTableCollapsed, setIsMainTableCollapsed] = useState(false)
  const [isArchivedTableCollapsed, setIsArchivedTableCollapsed] = useState(true)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
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
  const { syncStatus, syncDetails, progressPercentage, startSync } = useThreadSync(providerToken, userEmail)

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
    'Neutral': 'bg-yellow-100 text-yellow-800',
    'Needs Attention': 'bg-yellow-100 text-yellow-800',
  };

  // Sort handler - cycles through: desc → asc → null (default)
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Same column clicked - cycle through states
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      // New column clicked - start with descending
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Sort companies based on current sort state
  const sortCompanies = (companiesToSort: Company[]): Company[] => {
    if (!sortColumn || !sortDirection) {
      // Default sort: alphabetical by company name
      return [...companiesToSort].sort((a, b) => {
        const aName = (a.company_name || '').toLowerCase()
        const bName = (b.company_name || '').toLowerCase()
        return aName.localeCompare(bName)
      })
    }

    return [...companiesToSort].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortColumn) {
        case 'company_name':
          aValue = (a.company_name || '').toLowerCase()
          bValue = (b.company_name || '').toLowerCase()
          break
        case 'health_score':
          aValue = a.health_score ?? -Infinity
          bValue = b.health_score ?? -Infinity
          break
        case 'status':
          aValue = (a.overall_sentiment || '').toLowerCase()
          bValue = (b.overall_sentiment || '').toLowerCase()
          break
        case 'mrr':
          aValue = a.mrr ?? -Infinity
          bValue = b.mrr ?? -Infinity
          break
        case 'renewal_date':
          aValue = a.renewal_date ? new Date(a.renewal_date).getTime() : -Infinity
          bValue = b.renewal_date ? new Date(b.renewal_date).getTime() : -Infinity
          break
        case 'last_interaction':
          aValue = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : -Infinity
          bValue = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : -Infinity
          break
        default:
          return 0
      }

      // Handle null/undefined values - place at end
      if (aValue === null || aValue === undefined || aValue === -Infinity) return 1
      if (bValue === null || bValue === undefined || bValue === -Infinity) return -1

      // Compare values
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue)
        return sortDirection === 'asc' ? comparison : -comparison
      } else {
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
        return sortDirection === 'asc' ? comparison : -comparison
      }
    })
  }

  // Get sorted companies
  const sortedCompanies = sortCompanies(companies)
  const sortedArchivedCompanies = sortCompanies(archivedCompanies)

  // Render sortable column header
  const renderSortableHeader = (columnKey: string, label: string) => {
    const isActive = sortColumn === columnKey
    const isAsc = isActive && sortDirection === 'asc'
    const isDesc = isActive && sortDirection === 'desc'

    return (
      <th 
        scope="col" 
        className="px-6 py-3"
      >
        <button
          onClick={() => handleSort(columnKey)}
          className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
            isActive 
              ? 'bg-gray-200 hover:bg-gray-300' 
              : 'hover:bg-gray-100'
          }`}
        >
          <span>{label}</span>
          <div className="flex flex-col items-center">
            <ArrowUp 
              className={`h-3 w-3 ${
                isAsc ? 'text-gray-700' : 'text-gray-400'
              }`} 
            />
            <ArrowDown 
              className={`h-3 w-3 -mt-1 ${
                isDesc ? 'text-gray-700' : 'text-gray-400'
              }`} 
            />
          </div>
        </button>
      </th>
    )
  }

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
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{syncDetails || 'Syncing threads...'}</span>
          </div>
          {syncStatus === 'syncing' && (
            <div className="w-full max-w-md">
              <ProgressBar percentage={progressPercentage ?? 0} />
            </div>
          )}
          {syncStatus === 'creating_job' && (
            <div className="w-full max-w-md">
              <ProgressBar percentage={0} />
            </div>
          )}
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
      setSelectedCompanies(sortedCompanies.map(c => c.company_id))
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

    if (window.confirm(`Are you sure you want to archive ${selectedCompanies.length} companies? They will be moved to archives and no new emails will be imported from these domains. Historical data will be preserved.`)) {
      try {
        // Get user ID for blocklist
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.error('Not authenticated')
          return
        }

        // Get the selected companies with their domain names
        const companiesToArchive = companies.filter(c => selectedCompanies.includes(c.company_id))
        const domainsToBlock = companiesToArchive.map(c => c.domain_name).filter(Boolean)

        // Add domains to blocklist with 'archived' status
        if (domainsToBlock.length > 0) {
          const blocklistEntries = domainsToBlock.map(domain => ({
            user_id: user.id,
            domain: domain.toLowerCase(),
            status: 'archived'
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
            // Continue with archiving even if blocklist fails
          } else {
            console.log(`✅ Added ${domainsToBlock.length} domain(s) to blocklist with archived status`)
          }
        }

        // Update companies status to 'archived'
        const { error } = await supabase
          .from('companies')
          .update({ status: 'archived' })
          .in('company_id', selectedCompanies)

        if (!error) {
          setSelectedCompanies([])
          // Wait a moment for database to process
          await new Promise(resolve => setTimeout(resolve, 300))
          
          // Refresh the list
          const resp = await fetch('/api/customers', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
          if (resp.ok) {
            const json = await resp.json()
            setCompanies((json.companies as Company[]) || [])
            setArchivedCompanies((json.archivedCompanies as Company[]) || [])
          }
        } else {
          console.error('Error archiving companies:', error)
          // TODO: Show toast error
        }
      } catch (err) {
        console.error('Error in handleArchiveSelected:', err)
        // TODO: Show toast error
      }
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
            domain: domain.toLowerCase(),
            status: 'deleted'
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
        // This will cascade delete:
        // - thread_company_link entries (ON DELETE CASCADE)
        // - customers with matching company_id (ON DELETE CASCADE after migration)
        // - thread_messages will have customer_id set to NULL (ON DELETE SET NULL)
        const { error } = await supabase
          .from('companies')
          .delete()
          .in('company_id', selectedCompanies)

        if (!error) {
          setSelectedCompanies([])
          // Force a hard refresh to ensure deleted companies don't appear
          // Wait a moment for database to process cascade deletes
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Refresh the list
          const resp = await fetch('/api/customers', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
          if (resp.ok) {
            const json = await resp.json()
            setCompanies((json.companies as Company[]) || [])
            setArchivedCompanies((json.archivedCompanies as Company[]) || [])
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

        {/* Main Company Table */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => setIsMainTableCollapsed(!isMainTableCollapsed)}
              className="flex items-center space-x-2 text-lg font-semibold text-gray-800 hover:text-gray-900"
            >
              <span>{isMainTableCollapsed ? '▶' : '▼'}</span>
              <h2>Company Overview</h2>
              <span className="text-sm font-normal text-gray-500">({companies.length})</span>
            </button>
            
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

          {!isMainTableCollapsed && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="p-4">
                    <input 
                      type="checkbox" 
                      className="rounded" 
                      checked={sortedCompanies.length > 0 && selectedCompanies.length === sortedCompanies.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  {renderSortableHeader('company_name', 'Company Name')}
                  {renderSortableHeader('health_score', 'Health Score')}
                  {renderSortableHeader('status', 'Status')}
                  {renderSortableHeader('mrr', 'MRR')}
                  {renderSortableHeader('renewal_date', 'Renewal Date')}
                  {renderSortableHeader('last_interaction', 'Last Interaction')}
                  <th scope="col" className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center p-8">Loading companies...</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="text-center p-8 text-red-500">{error}</td></tr>
                ) : sortedCompanies.length === 0 ? (
                  <tr><td colSpan={8} className="text-center p-8 text-gray-500">No companies found. Companies will appear here after thread sync.</td></tr>
                ) : (
                  sortedCompanies.map((company, index) => {
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
                          <HealthScoreBar score={company.health_score} showLabel={true} />
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
          )}
        </div>

        {/* Archived Company Table */}
        {archivedCompanies.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-6 flex items-center justify-between">
              <button
                onClick={() => setIsArchivedTableCollapsed(!isArchivedTableCollapsed)}
                className="flex items-center space-x-2 text-lg font-semibold text-gray-800 hover:text-gray-900"
              >
                <span>{isArchivedTableCollapsed ? '▶' : '▼'}</span>
                <h2>Archives</h2>
                <span className="text-sm font-normal text-gray-500">({archivedCompanies.length})</span>
              </button>
              
              {/* Bulk Actions for Archived */}
              <div className="flex items-center space-x-3">
                {selectedArchivedCompanies.length > 0 && (
                  <span className="text-sm font-semibold text-gray-700">
                    {selectedArchivedCompanies.length} selected
                  </span>
                )}
                <button
                  onClick={async () => {
                    if (selectedArchivedCompanies.length === 0) return
                    if (window.confirm(`Are you sure you want to restore ${selectedArchivedCompanies.length} companies from archives? They will be moved back to the main table and new emails will be imported.`)) {
                      try {
                        // Get user ID for blocklist
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) {
                          console.error('Not authenticated')
                          return
                        }

                        // Get the selected companies with their domain names
                        const companiesToRestore = archivedCompanies.filter(c => selectedArchivedCompanies.includes(c.company_id))
                        const domainsToUnblock = companiesToRestore.map(c => c.domain_name).filter(Boolean)

                        // Remove domains from blocklist (only if status is 'archived', not 'deleted')
                        if (domainsToUnblock.length > 0) {
                          const { error: blocklistError } = await supabase
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore - domain_blocklist table not yet in TypeScript types
                            .from('domain_blocklist')
                            .delete()
                            .eq('user_id', user.id)
                            .in('domain', domainsToUnblock.map(d => d.toLowerCase()))
                            .eq('status', 'archived')

                          if (blocklistError) {
                            console.error('Error removing domains from blocklist:', blocklistError)
                            // Continue with restore even if blocklist removal fails
                          } else {
                            console.log(`✅ Removed ${domainsToUnblock.length} domain(s) from blocklist`)
                          }
                        }

                        // Update companies status to 'active'
                        const { error } = await supabase
                          .from('companies')
                          .update({ status: 'active' })
                          .in('company_id', selectedArchivedCompanies)
                        
                        if (!error) {
                          setSelectedArchivedCompanies([])
                          await new Promise(resolve => setTimeout(resolve, 300))
                          const resp = await fetch('/api/customers', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
                          if (resp.ok) {
                            const json = await resp.json()
                            setCompanies((json.companies as Company[]) || [])
                            setArchivedCompanies((json.archivedCompanies as Company[]) || [])
                          }
                        } else {
                          console.error('Error restoring companies:', error)
                        }
                      } catch (err) {
                        console.error('Error in restore:', err)
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={selectedArchivedCompanies.length === 0}
                >
                  Restore{selectedArchivedCompanies.length > 0 && ` (${selectedArchivedCompanies.length})`}
                </button>
              </div>
            </div>

            {!isArchivedTableCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-600">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                      <th scope="col" className="p-4">
                        <input 
                          type="checkbox" 
                          className="rounded" 
                          checked={sortedArchivedCompanies.length > 0 && selectedArchivedCompanies.length === sortedArchivedCompanies.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedArchivedCompanies(sortedArchivedCompanies.map(c => c.company_id))
                            } else {
                              setSelectedArchivedCompanies([])
                            }
                          }}
                        />
                      </th>
                      {renderSortableHeader('company_name', 'Company Name')}
                      {renderSortableHeader('health_score', 'Health Score')}
                      {renderSortableHeader('status', 'Status')}
                      {renderSortableHeader('mrr', 'MRR')}
                      {renderSortableHeader('renewal_date', 'Renewal Date')}
                      {renderSortableHeader('last_interaction', 'Last Interaction')}
                      <th scope="col" className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedArchivedCompanies.map((company, index) => {
                      const isSelected = selectedArchivedCompanies.includes(company.company_id);
                      return (
                        <tr key={index} className="bg-white border-b hover:bg-gray-50">
                          <td className="p-4">
                            <input 
                              type="checkbox" 
                              className="rounded" 
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedArchivedCompanies([...selectedArchivedCompanies, company.company_id])
                                } else {
                                  setSelectedArchivedCompanies(selectedArchivedCompanies.filter(id => id !== company.company_id))
                                }
                              }}
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
                              <HealthScoreBar score={company.health_score} showLabel={true} />
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
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default CustomerThreadsPage

