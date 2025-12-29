'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSupabase } from '@/components/SupabaseProvider'
import MeetingCard from './MeetingCard'

interface Meeting {
  id: string | number
  title: string | null
  start_time: string | null
  end_time: string | null
  meeting_url: string | null
  duration_minutes: number
}

export default function UpcomingMeetings() {
  const [viewMode, setViewMode] = useState<'upcoming' | 'completed'>('upcoming')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  useEffect(() => {
    const fetchMeetings = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('fetch-meetings', {
          method: 'POST',
          body: { viewMode }
        })

        if (invokeError) {
          throw invokeError
        }

        if (data && data.meetings) {
          setMeetings(data.meetings)
        } else {
          setMeetings([])
        }
      } catch (err) {
        console.error('Error fetching meetings:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch meetings')
        setMeetings([])
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [viewMode, supabase])

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'upcoming' ? 'completed' : 'upcoming')
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
          Meetings
        </h3>
        <button
          onClick={toggleViewMode}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <span>{viewMode === 'upcoming' ? 'Upcoming' : 'Past'}</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-y-auto space-y-4 w-full" style={{ maxHeight: '22rem' }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
            <p className="ml-3 text-gray-500 dark:text-gray-400 text-sm">Loading meetings...</p>
          </div>
        ) : error ? (
          <p className="text-red-500 dark:text-red-400 text-sm text-center py-8">{error}</p>
        ) : meetings.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
            {viewMode === 'upcoming' 
              ? 'No upcoming meetings scheduled' 
              : 'No completed meetings'}
          </p>
        ) : (
          meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))
        )}
      </div>
    </div>
  )
}
