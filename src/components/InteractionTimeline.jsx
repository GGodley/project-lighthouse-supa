'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * InteractionTimeline
 * Renders a unified timeline of emails and meetings for a customer.
 *
 * Props:
 * - data: object containing the customer's profile plus `emails` and `meetings` arrays
 *   Example shape:
 *   {
 *     id: string,
 *     name: string,
 *     emails: [{ id, subject, snippet, received_at }],
 *     meetings: [{ google_event_id, title, summary, start_time, end_time }]
 *   }
 */
export default function InteractionTimeline({ data }) {
  const [timelineItems, setTimelineItems] = useState([])

  // Memoize normalized arrays to avoid recomputations
  const emails = useMemo(() => (Array.isArray(data?.emails) ? data.emails : []), [data])
  const meetings = useMemo(() => (Array.isArray(data?.meetings) ? data.meetings : []), [data])

  useEffect(() => {
    const items = []

    // Map emails into unified shape
    for (const email of emails) {
      items.push({
        type: 'email',
        date: email?.received_at || null,
        title: email?.subject || 'Email',
        content: email?.snippet || 'No summary available.',
        key: `email-${email?.id ?? Math.random()}`,
      })
    }

    // Map meetings into unified shape
    for (const meeting of meetings) {
      items.push({
        type: 'meeting',
        date: meeting?.start_time || null,
        title: meeting?.title || 'Meeting',
        content: meeting?.summary || 'No summary available.',
        key: `meeting-${meeting?.google_event_id ?? meeting?.id ?? Math.random()}`,
      })
    }

    // Sort by date desc (newest first). Items without date go last
    items.sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : -Infinity
      const bd = b.date ? new Date(b.date).getTime() : -Infinity
      return bd - ad
    })

    setTimelineItems(items)
  }, [emails, meetings])

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Interaction Timeline</h2>
      <p className="text-sm text-gray-500 mb-6">Combined emails and meetings for this customer.</p>

      <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
        {timelineItems.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No interactions found for this customer.</p>
          </div>
        )}

        {timelineItems.map((item) => (
          <div key={item.key} className="relative">
            {/* Timeline dot/icon */}
            <div className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full bg-white border-2 border-gray-300" />

            <div className="w-full text-left p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-start">
                {/* Icon circle */}
                <div className="mr-4 pt-1">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                    item.type === 'email' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {item.type === 'email' ? (
                      // Mail (envelope) icon
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-blue-600">
                        <path d="M1.5 6A2.5 2.5 0 0 1 4 3.5h16A2.5 2.5 0 0 1 22.5 6v12A2.5 2.5 0 0 1 20 20.5H4A2.5 2.5 0 0 1 1.5 18V6Zm2.239.5 7.09 5.319a1.5 1.5 0 0 0 1.842 0l7.09-5.319A1 1 0 0 0 19.999 5H4.001a1 1 0 0 0-.262 1.5Z" />
                      </svg>
                    ) : (
                      // Calendar icon
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-green-600">
                        <path d="M6.75 2.25a.75.75 0 0 1 .75.75V4.5h9V3a.75.75 0 1 1 1.5 0V4.5h.75A2.25 2.25 0 0 1 21 6.75v12A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75v-12A2.25 2.25 0 0 1 5.25 4.5H6V3a.75.75 0 0 1 .75-.75Zm-.75 6A.75.75 0 0 0 5.25 9v8.25c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H6Z" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Content card */}
                <div className="flex-grow">
                  <div className="flex items-center space-x-3">
                    <p className="font-semibold text-gray-800">
                      {item.type === 'email' ? 'Email' : 'Meeting'} - {formatDate(item.date)}
                    </p>
                  </div>
                  <p className="text-sm text-gray-900 mt-1 font-medium">{item.title || (item.type === 'email' ? 'Email' : 'Meeting')}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.content || 'No summary available.'}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(date) {
  if (!date) return 'Unknown date'
  try {
    const d = new Date(date)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return 'Unknown date'
  }
}


