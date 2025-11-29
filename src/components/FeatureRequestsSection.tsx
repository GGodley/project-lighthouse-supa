'use client'

import React, { useState, useMemo } from 'react'
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { apiFetchJson } from '@/lib/api-client'
import EditablePill from './EditablePill'
import { useSupabase } from '@/components/SupabaseProvider'
import { getThreadById } from '@/lib/threads/queries'
import ThreadConversationView from './ThreadConversationView'
import MeetingDetailView from './MeetingDetailView'
import { LLMSummary } from '@/lib/types/threads'
import type { Database } from '@/types/database'

type Meeting = Database['public']['Tables']['meetings']['Row']
type FeatureRequestRow = Database['public']['Tables']['feature_requests']['Row']

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
  owner: string | null
  meeting_id: number | null
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

  // Debug logging - comprehensive
  React.useEffect(() => {
    console.log('[FeatureRequestsSection] ========== CLIENT-SIDE DEBUG ==========')
    console.log('[FeatureRequestsSection] Received feature requests prop:', featureRequests)
    console.log('[FeatureRequestsSection] Array length:', featureRequests.length)
    console.log('[FeatureRequestsSection] Array type:', Array.isArray(featureRequests))
    console.log('[FeatureRequestsSection] Full array:', JSON.stringify(featureRequests, null, 2))
    
    if (featureRequests.length > 0) {
      console.log('[FeatureRequestsSection] ✅ Feature requests found!')
      console.log('[FeatureRequestsSection] Sample feature request:', featureRequests[0])
      console.log('[FeatureRequestsSection] All feature request IDs:', featureRequests.map(fr => fr.id))
      console.log('[FeatureRequestsSection] Feature request titles:', featureRequests.map(fr => fr.title))
      console.log('[FeatureRequestsSection] Feature request company IDs:', featureRequests.map(fr => fr.company_id))
      console.log('[FeatureRequestsSection] Feature request companies:', featureRequests.map(fr => fr.company_name))
      console.log('[FeatureRequestsSection] Completed count:', featureRequests.filter(fr => fr.completed).length)
      console.log('[FeatureRequestsSection] Active count:', featureRequests.filter(fr => !fr.completed).length)
    } else {
      console.warn('[FeatureRequestsSection] WARNING: No feature requests received!')
      console.warn('[FeatureRequestsSection] This could mean:')
      console.warn('  1. No feature requests exist in database for user companies')
      console.warn('  2. Feature requests are being filtered out (missing features, archived companies, etc.)')
      console.warn('  3. Query is not finding feature requests')
    }
  }, [featureRequests])
  const supabase = useSupabase()

  // Modal state for thread/meeting views
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedThreadSummary, setSelectedThreadSummary] = useState<LLMSummary | { error: string } | null>(null)
  const [loadingThread, setLoadingThread] = useState<boolean>(false)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [loadingMeeting, setLoadingMeeting] = useState<boolean>(false)

  // Open source modal (thread or meeting)
  const openSourceModal = async (fr: DashboardFeatureRequest) => {
    if (fr.source === 'thread' && fr.source_id) {
      setLoadingThread(true)
      setSelectedThreadId(fr.source_id)
      setSelectedMeetingId(null)
      setSelectedMeeting(null)
      
      try {
        const { data: thread, error: threadError } = await getThreadById(supabase, fr.source_id)
        
        if (threadError || !thread) {
          console.error('Thread fetch error:', threadError)
          setSelectedThreadSummary({ error: threadError?.message || 'Thread not found' })
        } else {
          setSelectedThreadSummary(thread.llm_summary)
        }
      } catch (err) {
        console.error('Error fetching thread:', err)
        setSelectedThreadSummary({ error: 'Failed to load thread' })
      } finally {
        setLoadingThread(false)
      }
    } else if (fr.source === 'meeting' && fr.meeting_id) {
      setLoadingMeeting(true)
      // Use meeting_id (database ID) to fetch the meeting
      // This matches the same meeting that appears in the interaction timeline
      setSelectedMeetingId(fr.meeting_id.toString())
      setSelectedThreadId(null)
      setSelectedThreadSummary(null)
      
      try {
        // Fetch meeting by database ID (id field, not google_event_id)
        // The meeting_id in feature_requests is the database ID
        const { data: meeting, error: meetingError } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', fr.meeting_id)
          .single()
        
        if (meetingError || !meeting) {
          console.error('Error fetching meeting:', meetingError)
          setSelectedMeeting(null)
        } else {
          setSelectedMeeting(meeting)
          // Store google_event_id for consistency with interaction timeline
          setSelectedMeetingId(meeting.google_event_id)
        }
      } catch (err) {
        console.error('Error fetching meeting:', err)
        setSelectedMeeting(null)
      } finally {
        setLoadingMeeting(false)
      }
    } else if (fr.source === 'email') {
      // Legacy email source - show message or handle appropriately
      alert('Email source feature requests are not yet supported in the modal view.')
    }
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

  // Update priority (urgency)
  const updatePriority = async (fr: DashboardFeatureRequest, priority: string | null) => {
    setUpdatingRequestId(fr.id)
    try {
      const response = await apiFetchJson<FeatureRequestRow>(
        `/api/feature-requests/${fr.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ priority }),
        }
      )

      // The API returns the database record, but we need to preserve computed fields
      // Map urgency from response to the existing feature request
      const updated: DashboardFeatureRequest = {
        ...fr,
        urgency: (response.urgency || priority || 'Low') as 'Low' | 'Medium' | 'High',
      }

      setLocalFeatureRequests(
        localFeatureRequests.map((r) => (r.id === fr.id ? updated : r))
      )
    } catch (err) {
      console.error('Error updating priority:', err)
      throw err
    } finally {
      setUpdatingRequestId(null)
    }
  }

  // Update owner
  const updateOwner = async (fr: DashboardFeatureRequest, owner: string | null) => {
    setUpdatingRequestId(fr.id)
    try {
      const response = await apiFetchJson<FeatureRequestRow>(
        `/api/feature-requests/${fr.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ owner }),
        }
      )

      // The API returns the database record, but we need to preserve computed fields
      const updated: DashboardFeatureRequest = {
        ...fr,
        owner: response.owner || null,
      }

      setLocalFeatureRequests(
        localFeatureRequests.map((r) => (r.id === fr.id ? updated : r))
      )
    } catch (err) {
      console.error('Error updating owner:', err)
      throw err
    } finally {
      setUpdatingRequestId(null)
    }
  }

  // Priority options for EditablePill
  const priorityOptions = [
    { value: 'High', label: 'High', className: 'bg-red-50 text-red-700 border border-red-200' },
    { value: 'Medium', label: 'Medium', className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
    { value: 'Low', label: 'Low', className: 'bg-gray-100 text-gray-800 border border-gray-200' }
  ]

  // Filter into active and completed
  const { activeRequests, completedRequests } = useMemo(() => {
    const active = localFeatureRequests.filter((fr) => !fr.completed)
    const completed = localFeatureRequests.filter((fr) => fr.completed)
    
    console.log('[FeatureRequestsSection] Filtered requests:', {
      total: localFeatureRequests.length,
      active: active.length,
      completed: completed.length
    })
    
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
                const sourceLabel = getSourceLabel(fr.source)
                
                return (
                  <div
                    key={fr.id}
                    className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <button
                        onClick={() => openSourceModal(fr)}
                        className="flex-1 text-left"
                      >
                        <h4 className="font-semibold text-gray-900 text-base hover:text-blue-600 transition-colors">{fr.title}</h4>
                      </button>
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
                      {/* Priority Pill (Editable) */}
                      <EditablePill
                        label="Priority"
                        value={fr.urgency}
                        options={priorityOptions}
                        onChange={(value) => updatePriority(fr, value)}
                        isLoading={updatingRequestId === fr.id}
                      />
                      {/* Owner Pill (Editable) */}
                      <EditablePill
                        label="Owner"
                        value={fr.owner}
                        onChange={(value) => updateOwner(fr, value)}
                        isLoading={updatingRequestId === fr.id}
                      />
                      {/* Company Name Badge (Read-only) */}
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {fr.company_name}
                      </span>
                      {/* Date Badge (Read-only) */}
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                        {formatDate(fr.requested_at)}
                      </span>
                      {/* Source Badge (Read-only, clickable for modal) */}
                      <button
                        onClick={() => openSourceModal(fr)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer hover:shadow-md transition-all ${
                          fr.source === 'meeting' 
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {sourceLabel}
                      </button>
                      {/* First Requested Badge (Read-only) */}
                      {fr.first_requested && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          First: {formatDate(fr.first_requested)}
                        </span>
                      )}
                      {/* Last Requested Badge (Read-only) */}
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
                      const sourceLabel = getSourceLabel(fr.source)
                      
                      return (
                        <div
                          key={fr.id}
                          className="block p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all hover:bg-gray-50 opacity-75"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <button
                              onClick={() => openSourceModal(fr)}
                              className="flex-1 text-left"
                            >
                              <h4 className="font-semibold text-gray-900 text-base hover:text-blue-600 transition-colors">{fr.title}</h4>
                            </button>
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
                            {/* Priority Pill (Editable) */}
                            <EditablePill
                              label="Priority"
                              value={fr.urgency}
                              options={priorityOptions}
                              onChange={(value) => updatePriority(fr, value)}
                              isLoading={updatingRequestId === fr.id}
                            />
                            {/* Owner Pill (Editable) */}
                            <EditablePill
                              label="Owner"
                              value={fr.owner}
                              onChange={(value) => updateOwner(fr, value)}
                              isLoading={updatingRequestId === fr.id}
                            />
                            {/* Company Name Badge (Read-only) */}
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {fr.company_name}
                            </span>
                            {/* Date Badge (Read-only) */}
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                              {formatDate(fr.requested_at)}
                            </span>
                            {/* Source Badge (Read-only, clickable for modal) */}
                            <button
                              onClick={() => openSourceModal(fr)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer hover:shadow-md transition-all ${
                                fr.source === 'meeting' 
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {sourceLabel}
                            </button>
                            {/* First Requested Badge (Read-only) */}
                            {fr.first_requested && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                First: {formatDate(fr.first_requested)}
                              </span>
                            )}
                            {/* Last Requested Badge (Read-only) */}
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

      {/* Thread Conversation Modal Overlay */}
      {selectedThreadId && (
        <div 
          className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedThreadId(null)
              setSelectedThreadSummary(null)
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {loadingThread ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="ml-4 text-gray-600">Loading thread...</p>
              </div>
            ) : (
              <ThreadConversationView
                threadId={selectedThreadId}
                threadSummary={selectedThreadSummary}
                onClose={() => {
                  setSelectedThreadId(null)
                  setSelectedThreadSummary(null)
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Meeting Detail Modal Overlay */}
      {selectedMeetingId && (
        <div 
          className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedMeetingId(null)
              setSelectedMeeting(null)
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {loadingMeeting ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="ml-4 text-gray-600">Loading meeting...</p>
              </div>
            ) : selectedMeeting ? (
              <MeetingDetailView
                meeting={selectedMeeting}
                companyId={localFeatureRequests.find(fr => {
                  if (fr.source !== 'meeting' || !fr.meeting_id || !selectedMeeting) return false
                  // Match by meeting_id (database ID) or google_event_id
                  // The meetings table has an 'id' field (BIGINT primary key) that may not be in the type definition
                  // We use type assertion to access it safely
                  const meetingWithId = selectedMeeting as Meeting & { id: number }
                  return fr.meeting_id === meetingWithId.id || fr.source_id === selectedMeeting.google_event_id
                })?.company_id || ''}
                onClose={() => {
                  setSelectedMeetingId(null)
                  setSelectedMeeting(null)
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-red-600">
                <p>Failed to load meeting details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FeatureRequestsSection

