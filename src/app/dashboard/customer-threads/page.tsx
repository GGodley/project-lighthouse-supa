'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/SupabaseProvider'
import { Loader2, CheckCircle2, XCircle, RefreshCw, ArrowUp, ArrowDown, Search, Building2 } from 'lucide-react'
import { useThreadSync } from '@/hooks/useThreadSync'
import HealthScoreBar from '@/components/ui/HealthScoreBar'
import ProgressBar from '@/components/ui/ProgressBar'
import ConfirmModal from '@/components/ui/ConfirmModal'


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
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant?: 'default' | 'danger'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  })
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
      let aValue: string | number
      let bValue: string | number

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

  // Filter companies by search query
  const filterCompanies = (companiesToFilter: Company[]) => {
    if (!searchQuery.trim()) return companiesToFilter
    const query = searchQuery.toLowerCase()
    return companiesToFilter.filter(company => 
      company.company_name?.toLowerCase().includes(query) ||
      company.domain_name?.toLowerCase().includes(query)
    )
  }

  // Get sorted and filtered companies
  const sortedCompanies = sortCompanies(filterCompanies(companies))
  const sortedArchivedCompanies = sortCompanies(filterCompanies(archivedCompanies))


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
        setArchivedCompanies((json.archivedCompanies as Company[]) || [])
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
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Ready to sync</span>
        </div>
      )
    }

    if (syncStatus === 'creating_job' || syncStatus === 'syncing') {
      return (
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
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
        <div className="flex items-center space-x-2 text-sm text-gray-700">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>{syncDetails || 'Sync completed'}</span>
          <button
            onClick={() => startSync()}
            className="ml-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )
    }

    if (syncStatus === 'failed') {
      return (
        <div className="flex items-center space-x-2 text-sm text-gray-700">
          <XCircle className="h-4 w-4 text-red-600" />
          <span>{syncDetails || 'Sync failed'}</span>
          <button
            onClick={() => startSync()}
            className="ml-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )
    }

    return null
  }

  // Render sortable column header
  const renderSortableHeader = (columnKey: string, label: string) => {
    const isActive = sortColumn === columnKey
    const isAsc = isActive && sortDirection === 'asc'
    const isDesc = isActive && sortDirection === 'desc'

    return (
      <th 
        scope="col" 
        className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
      >
        <button
          onClick={() => handleSort(columnKey)}
          className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors hover:bg-gray-100 ${
            isActive ? 'bg-gray-100' : ''
          }`}
        >
          <span>{label}</span>
          <div className="flex flex-col items-center">
            <ArrowUp 
              className={`h-3 w-3 ${
                isAsc ? 'text-gray-900' : 'text-gray-400'
              }`} 
            />
            <ArrowDown 
              className={`h-3 w-3 -mt-1 ${
                isDesc ? 'text-gray-900' : 'text-gray-400'
              }`} 
            />
          </div>
        </button>
      </th>
    )
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
  const handleArchiveSelected = () => {
    if (selectedCompanies.length === 0) return

    setConfirmModal({
      isOpen: true,
      title: 'Archive Companies',
      message: `Are you sure you want to archive ${selectedCompanies.length} ${selectedCompanies.length === 1 ? 'company' : 'companies'}? They will be moved to archives and no new emails will be imported from these domains. Historical data will be preserved.`,
      variant: 'default',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
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
    })
  }

  const handleDeleteSelected = () => {
    if (selectedCompanies.length === 0) return

    setConfirmModal({
      isOpen: true,
      title: 'Delete Companies',
      message: `Are you sure you want to PERMANENTLY DELETE ${selectedCompanies.length} ${selectedCompanies.length === 1 ? 'company' : 'companies'}? Their domains will be added to the blocklist to prevent future imports. This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
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
    })
  }

  return (
    <div className="min-h-screen glass-bg">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <header className="glass-header rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Customer Threads</h1>
              <p className="text-sm text-gray-600 mt-1">
                <a href="/dashboard" className="hover:text-gray-900 transition-colors">Dashboard</a> / <span className="font-medium">Customer Threads</span>
              </p>
              {/* Sync Status Display */}
              <div className="mt-2">
                {renderSyncStatus()}
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search companies..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input w-full pl-10 pr-4 py-2 rounded-xl text-sm" 
                />
              </div>
              <div className="relative">
                <select
                  value={sortColumn || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSortColumn(e.target.value)
                      setSortDirection('desc')
                    } else {
                      setSortColumn(null)
                      setSortDirection(null)
                    }
                  }}
                  className="glass-input appearance-none pl-4 pr-10 py-2 rounded-xl text-sm cursor-pointer focus:outline-none"
                >
                  <option value="">Sort by...</option>
                  <option value="company_name">Company Name</option>
                  <option value="health_score">Health Score</option>
                  <option value="status">Status</option>
                  <option value="last_interaction">Last Interaction</option>
                </select>
                {sortColumn && (
                  <button
                    onClick={() => {
                      if (sortDirection === 'desc') {
                        setSortDirection('asc')
                      } else if (sortDirection === 'asc') {
                        setSortColumn(null)
                        setSortDirection(null)
                      }
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-900"
                    title={sortDirection === 'desc' ? 'Sort ascending' : 'Clear sort'}
                  >
                    {sortDirection === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <button 
                onClick={() => startSync()}
                disabled={syncStatus === 'creating_job' || syncStatus === 'syncing'}
                className="glass-button px-5 py-2 text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Threads'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Company Table */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <button
              onClick={() => setIsMainTableCollapsed(!isMainTableCollapsed)}
              className="flex items-center space-x-2 text-lg font-semibold text-gray-800 hover:text-gray-900 transition-colors"
            >
              <span className="text-xl">{isMainTableCollapsed ? '▶' : '▼'}</span>
              <h2 className="text-gray-900">Company Overview</h2>
              <span className="text-sm font-normal text-gray-600">({sortedCompanies.length})</span>
            </button>
            
            {/* Bulk Actions - Always visible */}
            <div className="flex items-center space-x-3 flex-wrap">
              {selectedCompanies.length > 0 && (
                <span className="text-sm font-semibold text-gray-700">
                  {selectedCompanies.length} selected
                </span>
              )}
              <button
                onClick={handleArchiveSelected}
                className="glass-button px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedCompanies.length === 0}
                title={selectedCompanies.length === 0 ? "Select companies to archive" : `Archive ${selectedCompanies.length} companies`}
              >
                Archive{selectedCompanies.length > 0 && ` (${selectedCompanies.length})`}
              </button>
              <button
                onClick={handleDeleteSelected}
                className="glass-button px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                disabled={selectedCompanies.length === 0}
                title={selectedCompanies.length === 0 ? "Select companies to delete" : `Delete ${selectedCompanies.length} companies`}
              >
                Delete{selectedCompanies.length > 0 && ` (${selectedCompanies.length})`}
              </button>
            </div>
          </div>

          {!isMainTableCollapsed && (
            <div className="overflow-x-auto">
              <table className="glass-table w-full text-sm text-left rounded-xl">
                <thead className="glass-table-header sticky top-0 z-10">
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
                    {renderSortableHeader('last_interaction', 'Last Interaction')}
                  </tr>
                </thead>
                <tbody className="space-y-2">
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-8 text-gray-600">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading companies...</p>
                    </td></tr>
                  ) : error ? (
                    <tr><td colSpan={5} className="text-center p-8 text-red-600">
                      <XCircle className="h-6 w-6 mx-auto mb-2" />
                      <p>{error}</p>
                    </td></tr>
                  ) : sortedCompanies.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-gray-500">
                      <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No companies found</p>
                      <p className="text-sm mt-2">Companies will appear here after thread sync.</p>
                    </td></tr>
                  ) : (
                    sortedCompanies.map((company, index) => {
                      const isSelected = selectedCompanies.includes(company.company_id);
                      return (
                        <tr key={index} className={`glass-bar-row ${isSelected ? 'selected' : ''}`}>
                          <td className="p-5 pl-6">
                            <input 
                              type="checkbox" 
                              className="rounded w-4 h-4 cursor-pointer" 
                              checked={isSelected}
                              onChange={(e) => handleSelectOne(company.company_id, e.target.checked)}
                            />
                          </td>
                          <td className="px-6 py-5">
                            <Link 
                              href={`/dashboard/customer-threads/${company.company_id}`} 
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-base"
                            >
                              {company.company_name}
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
                              <span className="text-gray-400">Not set</span>
                            )}
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

        {/* Archived Company Cards */}
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <button
              onClick={() => setIsArchivedTableCollapsed(!isArchivedTableCollapsed)}
              className="flex items-center space-x-2 text-lg font-semibold text-gray-800 hover:text-gray-900 transition-colors"
            >
              <span className="text-xl">{isArchivedTableCollapsed ? '▶' : '▼'}</span>
              <h2 className="text-gray-900">Archives</h2>
              <span className="text-sm font-normal text-gray-600">({sortedArchivedCompanies.length})</span>
            </button>
            
            {/* Bulk Actions for Archived */}
            <div className="flex items-center space-x-3 flex-wrap">
              {selectedArchivedCompanies.length > 0 && (
                <span className="text-sm font-semibold text-gray-700">
                  {selectedArchivedCompanies.length} selected
                </span>
              )}
              <button
                onClick={() => {
                  if (selectedArchivedCompanies.length === 0) return
                  setConfirmModal({
                    isOpen: true,
                    title: 'Restore Companies',
                    message: `Are you sure you want to restore ${selectedArchivedCompanies.length} ${selectedArchivedCompanies.length === 1 ? 'company' : 'companies'} from archives? They will be moved back to the main table and new emails will be imported.`,
                    variant: 'default',
                    onConfirm: async () => {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
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
                  })
                }}
                className="glass-button px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                disabled={selectedArchivedCompanies.length === 0}
              >
                Restore{selectedArchivedCompanies.length > 0 && ` (${selectedArchivedCompanies.length})`}
              </button>
            </div>
          </div>

          {!isArchivedTableCollapsed && (
            <div className="overflow-x-auto">
              <table className="glass-table w-full text-sm text-left rounded-xl opacity-90">
                <thead className="glass-table-header sticky top-0 z-10">
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
                    {renderSortableHeader('last_interaction', 'Last Interaction')}
                  </tr>
                </thead>
                <tbody>
                  {sortedArchivedCompanies.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-gray-500">
                      <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No archived companies</p>
                      <p className="text-sm mt-2">Archived companies will appear here.</p>
                    </td></tr>
                  ) : (
                    sortedArchivedCompanies.map((company, index) => {
                      const isSelected = selectedArchivedCompanies.includes(company.company_id);
                      return (
                        <tr key={index} className={`glass-bar-row ${isSelected ? 'selected' : ''}`}>
                          <td className="p-5 pl-6">
                            <input 
                              type="checkbox" 
                              className="rounded w-4 h-4 cursor-pointer" 
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
                          <td className="px-6 py-5">
                            <Link 
                              href={`/dashboard/customer-threads/${company.company_id}`} 
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-base"
                            >
                              {company.company_name}
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
                              <span className="text-gray-400">Not set</span>
                            )}
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

        {/* Confirmation Modal */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          variant={confirmModal.variant}
          confirmLabel={confirmModal.variant === 'danger' ? 'Delete' : 'Confirm'}
        />
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default CustomerThreadsPage

