'use client'

import { useEffect, useState } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { Clock } from 'lucide-react'

interface Meeting {
  title: string | null
  start_time: string | null
  end_time: string | null
  customer_name: string | null
}

export default function UpcomingMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setLoading(true)
        const today = new Date()
        const nextWeek = new Date(today)
        nextWeek.setDate(today.getDate() + 7)

        const response = await fetch(
          `/api/meetings?start=${today.toISOString()}&end=${nextWeek.toISOString()}`,
          { cache: 'no-store' }
        )

        if (response.ok) {
          const data = await response.json()
          setMeetings(data.meetings || [])
        }
      } catch (error) {
        console.error('Error fetching meetings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [])

  const formatTime = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
        Upcoming Meetings
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mini Calendar */}
        <div>
          <Calendar
            value={selectedDate}
            onChange={setSelectedDate}
            className="react-calendar-custom"
            tileClassName="react-calendar-tile"
          />
        </div>

        {/* Meeting List */}
        <div className="max-h-[300px] overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading meetings...</p>
          ) : meetings.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No meetings scheduled this week</p>
          ) : (
            meetings.map((meeting, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-white/50 dark:bg-slate-700/50 border border-white/50 dark:border-white/10"
              >
                <div className="flex items-start gap-2">
                  <div className="w-1 h-full bg-blue-500 dark:bg-blue-400 rounded-full" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">
                      {meeting.title || 'Scheduled call'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(meeting.start_time)} - {formatTime(meeting.end_time)}
                      </span>
                    </div>
                    {meeting.customer_name && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {meeting.customer_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

