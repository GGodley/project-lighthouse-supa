'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { apiFetchJson } from '@/lib/api-client'

interface DashboardFeatureRequest {
  id: string
  title: string
  company_name: string
  company_id: string
  requested_at: string
  source: 'email' | 'meeting' | 'thread'
  source_id: string | null
  urgency: 'Low' | 'Medium' | 'High'
  completed: boolean
  first_requested: string | null
  last_requested: string | null
}

interface FeatureRequestsSectionProps {
  featureRequests: DashboardFeatureRequest[]
}

type SortOption = 'company-a-z' | 'urgency' | 'date' | 'company' | 'source'

const FeatureRequestsSection: React.FC<FeatureRequestsSectionProps> = ({ featureRequests }) => {
  const [selectedSort, setSelectedSort] = useState<SortOption>('company-a-z')
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null)
  const [localFeatureRequests, setLocalFeatureRequests] = useState<DashboardFeatureRequest[]>(featureRequests)

  // Build navigation URL for feature request
  const getFeatureRequestUrl = (fr: DashboardFeatureRequest): string => {
    if (!fr.company_id) return '#'
    
    if (fr.source === 'thread' && fr.source_id) {
      return `/dashboard/customer-threads/${fr.company_id}?thread=${fr.source_id}`
    } else if (fr.source === 'meeting' && fr.source_id) {
      // Navigate to company page - meeting will be shown in interaction timeline
      return `/dashboard/customer-threads/${fr.company_id}`
    } else if (fr.source === 'email') {
      // Legacy email source - navigate to company page
      return `/dashboard/customer-threads/${fr.company_id}`
    }
    
    return `/dashboard/customer-threads/${fr.company_id}`
  }

  // Format date for display
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Get source label
  const getSourceLabel = (source: string): string => {
    if (source === 'meeting') return 'Meeting'
    if (source === 'email') return 'Mail'
    if (source === 'thread') return 'Mail'
    return 'Unknown'
  }

  // Update local state when prop changes
  React.useEffect(() => {
    setLocalFeatureRequests(featureRequests)
  }, [featureRequests])

  // Toggle feature request completion
  const toggleFeatureRequest = async (fr: DashboardFeatureRequest) => {
    setUpdatingRequestId(fr.id)
    try {
      const updated = await apiFetchJson<DashboardFeatureRequest>(
        `/api/feature-requests/${fr.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ completed: !fr.completed }),
        }
      )

      // Update local state
      setLocalFeatureRequests(
        localFeatureRequests.map((r) => (r.id === fr.id ? updated : r))
      )
    } catch (err) {
      console.error('Error updating feature request:', err)
      // Revert on error - could show a toast notification here
    } finally {
      setUpdatingRequestId(null)
    }
  }

  // Get urgency badge styles
  const getUrgencyStyles = (urgency: 'Low' | 'Medium' | 'High'): string => {
    switch (urgency) {
      case 'High':
        return 'bg-red-50 text-red-700 border border-red-200'
      case 'Medium':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      case 'Low':
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200'
    }
  }

  // Filter into active and completed
  const { activeRequests, completedRequests } = useMemo(() => {
    const active = localFeatureRequests.filter((fr) => !fr.completed)
    const completed = localFeatureRequests.filter((fr) => fr.completed)
    return { activeRequests: active, completedRequests: completed }
  }, [localFeatureRequests])

  // Sorting functions
  const sortedFeatureRequests = useMemo(() => {
    const sorted = [...activeRequests]
    
    switch (selectedSort) {
      case 'company-a-z':
        // Sort by title alphabetically (A-Z)
        return sorted.sort((a, b) => a.title.localeCompare(b.title))
      
      case 'urgency':
        // Sort by urgency (High → Medium → Low), then by date descending
        const urgencyPriority = { High: 3, Medium: 2, Low: 1 }
        return sorted.sort((a, b) => {
          const urgencyDiff = urgencyPriority[b.urgency] - urgencyPriority[a.urgency]
          if (urgencyDiff !== 0) return urgencyDiff
          return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        })
      
      case 'date':
        // Sort by requested_at descending (most recent first)
        return sorted.sort((a, b) => 
          new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        )
      
      case 'company':
        // Sort by company_name alphabetically (A-Z), then by title
        return sorted.sort((a, b) => {
          const companyDiff = a.company_name.localeCompare(b.company_name)
          if (companyDiff !== 0) return companyDiff
          return a.title.localeCompare(b.title)
        })
      
      case 'source':
        // Sort by source priority (meeting → mail/thread), then by date descending
        const sourcePriority = { meeting: 1, email: 2, thread: 2 }
        return sorted.sort((a, b) => {
          const sourceDiff = sourcePriority[a.source] - sourcePriority[b.source]
          if (sourceDiff !== 0) return sourceDiff
          return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        })
      
      default:
        return sorted
    }
  }, [activeRequests, selectedSort])

  // Sort completed requests by date (most recent first)
  const sortedCompletedRequests = useMemo(() => {
    return [...completedRequests].sort(
      (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
    )
  }, [completedRequests])

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'company-a-z', label: 'Company A-Z' },
    { value: 'urgency', label: 'Urgency' },
    { value: 'date', label: 'Date' },
    { value: 'company', label: 'Company' },
    { value: 'source', label: 'Source' }
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Feature Requests</h3>
        
        {/* Sorting Pills */}
        <div className="flex flex-wrap gap-2">
          {sortOptions.map((option) => {
            const isSelected = selectedSort === option.value
            return (
              <button
                key={option.value}
                onClick={() => setSelectedSort(option.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        {sortedFeatureRequests.length === 0 && completedRequests.length === 0 ? (
          <div className="text-gray-500">No feature requests found.</div>
        ) : (
          <>
            {/* Active Feature Requests */}
            {sortedFeatureRequests.length > 0 && (
              sortedFeatureRequests.map((fr) => {
                const url = getFeatureRequestUrl(fr)
                const sourceLabel = getSourceLabel(fr.source)
                
                return (
                  <div
                    key={fr.id}
                    className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Link href={url} className="flex-1">
                        <h4 className="font-semibold text-gray-900 text-base">{fr.title}</h4>
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFeatureRequest(fr)
                        }}
                        disabled={updatingRequestId === fr.id}
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ml-2 ${
                          fr.completed
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 hover:border-blue-600'
                        } ${updatingRequestId === fr.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {fr.completed && <CheckCircle className="w-4 h-4 text-white" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* Urgency Badge */}
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getUrgencyStyles(fr.urgency)}`}>
                        {fr.urgency}
                      </span>
                      {/* Company Name Badge */}
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {fr.company_name}
                      </span>
                      {/* Date Badge */}
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                        {formatDate(fr.requested_at)}
                      </span>
                      {/* Source Badge */}
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                        fr.source === 'meeting' 
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {sourceLabel}
                      </span>
                      {/* First Requested Badge */}
                      {fr.first_requested && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          First: {formatDate(fr.first_requested)}
                        </span>
                      )}
                      {/* Last Requested Badge */}
                      {fr.last_requested && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          Last: {formatDate(fr.last_requested)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}

            {/* Completed Feature Requests Section */}
            {completedRequests.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setCompletedExpanded(!completedExpanded)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors mb-3"
                >
                  {completedExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Completed Feature Requests ({completedRequests.length})</span>
                </button>
                
                {completedExpanded && (
                  <div className="space-y-4">
                    {sortedCompletedRequests.map((fr) => {
                      const url = getFeatureRequestUrl(fr)
                      const sourceLabel = getSourceLabel(fr.source)
                      
                      return (
                        <div
                          key={fr.id}
                          className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all hover:bg-gray-50 opacity-75"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <Link href={url} className="flex-1">
                              <h4 className="font-semibold text-gray-900 text-base">{fr.title}</h4>
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFeatureRequest(fr)
                              }}
                              disabled={updatingRequestId === fr.id}
                              className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ml-2 ${
                                fr.completed
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-gray-300 hover:border-blue-600'
                              } ${updatingRequestId === fr.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {fr.completed && <CheckCircle className="w-4 h-4 text-white" />}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {/* Urgency Badge */}
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getUrgencyStyles(fr.urgency)}`}>
                              {fr.urgency}
                            </span>
                            {/* Company Name Badge */}
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {fr.company_name}
                            </span>
                            {/* Date Badge */}
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                              {formatDate(fr.requested_at)}
                            </span>
                            {/* Source Badge */}
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                              fr.source === 'meeting' 
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {sourceLabel}
                            </span>
                            {/* First Requested Badge */}
                            {fr.first_requested && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                First: {formatDate(fr.first_requested)}
                              </span>
                            )}
                            {/* Last Requested Badge */}
                            {fr.last_requested && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                                Last: {formatDate(fr.last_requested)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default FeatureRequestsSection

