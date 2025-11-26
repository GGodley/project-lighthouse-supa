'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'

interface DashboardFeatureRequest {
  id: string
  title: string
  company_name: string
  company_id: string
  requested_at: string
  source: 'email' | 'meeting' | 'thread'
  source_id: string | null
  urgency: 'Low' | 'Medium' | 'High'
}

interface FeatureRequestsSectionProps {
  featureRequests: DashboardFeatureRequest[]
}

type SortOption = 'company-a-z' | 'urgency' | 'date' | 'company' | 'source'

const FeatureRequestsSection: React.FC<FeatureRequestsSectionProps> = ({ featureRequests }) => {
  const [selectedSort, setSelectedSort] = useState<SortOption>('company-a-z')

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

  // Get urgency badge styles
  const getUrgencyStyles = (urgency: 'Low' | 'Medium' | 'High'): string => {
    switch (urgency) {
      case 'High':
        return 'bg-red-50 text-red-700 border border-red-200'
      case 'Medium':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      case 'Low':
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Sorting functions
  const sortedFeatureRequests = useMemo(() => {
    const sorted = [...featureRequests]
    
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
  }, [featureRequests, selectedSort])

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
        {sortedFeatureRequests.length === 0 ? (
          <div className="text-gray-500">No feature requests found.</div>
        ) : (
          sortedFeatureRequests.map((fr) => {
            const url = getFeatureRequestUrl(fr)
            const sourceLabel = getSourceLabel(fr.source)
            
            return (
              <Link
                key={fr.id}
                href={url}
                className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 text-base flex-1">{fr.title}</h4>
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
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
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
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

export default FeatureRequestsSection

