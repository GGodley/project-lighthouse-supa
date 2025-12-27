'use client'

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

      <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
        {items.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No interactions found for this company.</p>
          </div>
        )}

        {items.map((item) => {
          const dateParts = formatTimelineDate(item.timestamp)
          const isConversation = item.type === 'conversation'
          
          return (
            <div 
              key={`${item.type}-${item.id}`} 
              className="relative"
              onClick={() => handleItemClick(item.id, item.type)}
            >
              {/* Timeline dot/icon */}
              <div className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full bg-white border-2 border-gray-300" />

              <div className={`w-full text-left p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors ${onItemClick ? 'cursor-pointer' : ''}`}>
                <div className="flex items-start">
                  {/* Icon circle with badge */}
                  <div className="mr-4 pt-1 flex flex-col items-center">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                      isConversation ? 'bg-blue-50 border border-blue-100' : 'bg-purple-50 border border-purple-100'
                    }`}>
                      {isConversation ? (
                        // Mail (envelope) icon
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-blue-600">
                          <path d="M1.5 6A2.5 2.5 0 0 1 4 3.5h16A2.5 2.5 0 0 1 22.5 6v12A2.5 2.5 0 0 1 20 20.5H4A2.5 2.5 0 0 1 1.5 18V6Zm2.239.5 7.09 5.319a1.5 1.5 0 0 0 1.842 0l7.09-5.319A1 1 0 0 0 19.999 5H4.001a1 1 0 0 0-.262 1.5Z" />
                        </svg>
                      ) : (
                        // Video camera icon
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-purple-600">
                          <path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" />
                        </svg>
                      )}
                    </div>
                    {/* Badge */}
                    <span className={`mt-2 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      isConversation 
                        ? 'bg-blue-50 text-blue-600 border-blue-100' 
                        : 'bg-purple-50 text-purple-600 border-purple-100'
                    }`}>
                      {isConversation ? 'Conversation' : 'Meeting'}
                    </span>
                  </div>

                  {/* Content card */}
                  <div className="flex-grow">
                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-2">
                      {dateParts.dayOfWeek && (
                        <span className="text-xs font-semibold text-gray-500">{dateParts.dayOfWeek}</span>
                      )}
                      {dateParts.date && (
                        <span className="text-xs font-semibold text-gray-500">{dateParts.date}</span>
                      )}
                      {dateParts.year && (
                        <span className="text-xs font-semibold text-gray-500">{dateParts.year}</span>
                      )}
                    </div>
                    
                    {/* Title */}
                    <p className="text-sm text-gray-900 mt-1 font-medium">{item.title || (item.type === 'conversation' ? 'Conversation' : 'Meeting')}</p>
                    
                    {/* Summary */}
                    <p className="text-sm text-gray-600 mt-1">{item.summary || 'No summary available.'}</p>
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


