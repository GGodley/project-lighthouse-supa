'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSupabase } from '@/components/SupabaseProvider'
import { UpcomingMeetingCard } from '@/components/ui/UpcomingMeetingCard'

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
        {/* Navigation Controls - Segmented Control Group */}
        <div className="flex items-center gap-2">
          {/* Previous Button */}
          <button
            onClick={() => {
              // Placeholder for previous navigation
              console.log('Previous clicked')
            }}
            className="bg-white border border-gray-200 rounded-lg flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          {/* View Mode Dropdown */}
          <button
            onClick={toggleViewMode}
            className="bg-white border border-gray-200 rounded-lg flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
          >
            <span>{viewMode === 'upcoming' ? 'Upcoming' : 'Past'}</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          
          {/* Next Button */}
          <button
            onClick={() => {
              // Placeholder for next navigation
              console.log('Next clicked')
            }}
            className="bg-white border border-gray-200 rounded-lg flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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
          meetings.map((meeting) => {
            // Format date for UpcomingMeetingCard
            const formatDate = (dateString: string | null): string => {
              if (!dateString) return "Date TBD";
              try {
                const date = new Date(dateString);
                return date.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
              } catch {
                return "Date TBD";
              }
            };

            // Get platform from meeting URL
            const getPlatform = (): string => {
              if (!meeting.meeting_url) return "Google Meet";
              const url = meeting.meeting_url.toLowerCase();
              if (url.includes("zoom")) return "Zoom";
              if (url.includes("teams") || url.includes("microsoft")) return "Microsoft Teams";
              if (url.includes("meet") || url.includes("google")) return "Google Meet";
              return "Video Call";
            };

            return (
              <UpcomingMeetingCard
                key={meeting.id}
                title={meeting.title || "Untitled Meeting"}
                date={formatDate(meeting.start_time)}
                platform={getPlatform()}
              />
            );
          })
        )}
      </div>
    </div>
  )
}
