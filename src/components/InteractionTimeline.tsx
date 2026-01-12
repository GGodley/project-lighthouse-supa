'use client'

import { Mail, Video, Maximize2, Clock } from 'lucide-react'
import { useInteractionTimeline } from '@/hooks/useInteractionTimeline'

interface DateParts {
  dayOfWeek: string
  date: string
  year: string
}

interface InteractionTimelineProps {
  companyId: string | null
  onItemClick?: (id: string, type: 'conversation' | 'meeting') => void
}

/**
 * InteractionTimeline
 * Renders a unified timeline of conversations and meetings for a company.
 *
 * Props:
 * - companyId: UUID of the company to fetch timeline for
 * - onItemClick: Optional callback function that receives (id, type) when an item is clicked
 */
export default function InteractionTimeline({ companyId, onItemClick }: InteractionTimelineProps) {
  const { items, loading, error } = useInteractionTimeline(companyId)

  const handleItemClick = (id: string, type: 'conversation' | 'meeting'): void => {
    if (onItemClick) {
      onItemClick(id, type)
    }
  }

  function formatTimelineDate(timestamp: string | null | undefined): DateParts {
    if (!timestamp) return { dayOfWeek: '', date: '', year: '' }
    
    try {
      const d = new Date(timestamp)
      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
      const day = d.getDate()
      const date = `${month} ${day}`
      const year = d.getFullYear().toString()
      
      return { dayOfWeek, date, year }
    } catch {
      return { dayOfWeek: '', date: '', year: '' }
    }
  }

  function getDateString(timestamp: string | null | undefined): string {
    if (!timestamp) return ''
    try {
      const d = new Date(timestamp)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Interaction Timeline</h2>
        <p className="text-sm text-gray-500 mb-6">Loading timeline...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Interaction Timeline</h2>
        <p className="text-sm text-red-500 mb-6">Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Interaction Timeline</h2>
      <p className="text-sm text-gray-500 mb-6">Complete history of conversations and meetings for this company.</p>

      <div className="space-y-0">
        {items.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No interactions found for this company.</p>
          </div>
        )}

        {items.map((item, index) => {
          const dateParts = formatTimelineDate(item.timestamp)
          const isConversation = item.type === 'conversation'
          const isLast = index === items.length - 1
          const currentDateString = getDateString(item.timestamp)
          const previousDateString = index > 0 ? getDateString(items[index - 1].timestamp) : ''
          const showDate = index === 0 || currentDateString !== previousDateString
          const isUpcoming = new Date(item.timestamp) > new Date()
          
          return (
            <div 
              key={`${item.type}-${item.id}`} 
              className="grid grid-cols-[80px_40px_1fr] gap-0"
            >
              {/* Column 1: Date (right-aligned, vertical stack) */}
              <div className="pr-4 pt-1">
                {showDate ? (
                  <div className="flex flex-col items-end text-right leading-tight">
                    {dateParts.dayOfWeek && (
                      <span className="text-base font-bold text-gray-900">{dateParts.dayOfWeek}</span>
                    )}
                    {dateParts.date && (
                      <span className="text-xs font-medium text-gray-500">{dateParts.date}</span>
                    )}
                    {dateParts.year && (
                      <span className="text-xs font-medium text-gray-500">{dateParts.year}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-end text-right">
                    {/* Empty space to maintain alignment */}
                  </div>
                )}
              </div>

              {/* Column 2: Timeline Spine */}
              <div className="relative flex justify-center">
                {/* Vertical line - extends from node to next item */}
                {!isLast && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 w-px bg-gray-200" style={{ height: 'calc(100% - 0.75rem)' }} />
                )}
                {/* Node (12px circle) */}
                <div className="relative z-10 w-3 h-3 rounded-full bg-white border-2 border-gray-300 mt-1" />
              </div>

              {/* Column 3: Content Card */}
              <div className="pl-4 pb-6">
                <div className="max-w-3xl">
                  <div 
                    className={`relative bg-white border border-gray-200 rounded-xl shadow-sm p-4 ${onItemClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                    onClick={() => handleItemClick(item.id, item.type)}
                  >
                    {/* Badge Row: Type Badge (left) + Status Badge (right) */}
                    <div className="mb-2 flex items-center justify-between">
                      {/* Unified Type Badge with Icon + Upcoming Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          isConversation 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {isConversation ? (
                            <Mail className="w-3 h-3" />
                          ) : (
                            <Video className="w-3 h-3" />
                          )}
                          {isConversation ? 'Conversation' : 'Meeting'}
                        </span>
                        
                        {/* Upcoming Badge */}
                        {item.type === 'meeting' && isUpcoming && (
                          <span className="inline-flex items-center gap-x-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            <Clock className="h-3.5 w-3.5" />
                            Upcoming
                          </span>
                        )}
                      </div>
                      
                      {/* Status Badge (top-right) */}
                      <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-xs font-medium">
                        Completed
                      </span>
                    </div>
                    
                    {/* Title (bold) */}
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      {item.title || (isConversation ? 'Conversation' : 'Meeting')}
                    </p>
                    
                    {/* Summary */}
                    <p className="text-sm text-gray-600">
                      {item.summary || 'No summary available.'}
                    </p>
                    
                    {/* Expand Icon (bottom-right) */}
                    <Maximize2 className="absolute bottom-3 right-3 w-4 h-4 text-gray-300 hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


