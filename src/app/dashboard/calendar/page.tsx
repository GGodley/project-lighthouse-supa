'use client'

import { useState, useEffect, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import { EventInput } from '@fullcalendar/core'
import { useSupabase } from '@/components/SupabaseProvider'
import { Database } from '@/types/database'

type Meeting = Database['public']['Tables']['meetings']['Row']

export default function CalendarPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<EventInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  const syncAndFetchCalendar = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Step 1: Call sync-calendar Edge Function
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }

      // Get the provider_token from the session
      const providerToken = session.provider_token
      
      if (!providerToken) {
        console.error('Could not find provider token in session')
        throw new Error('Could not find provider token. Please re-authenticate.')
      }

      const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-calendar', {
        body: {
          provider_token: providerToken
        }
      })

      if (syncError) {
        console.error('Sync calendar error:', syncError)
        throw new Error(syncError.message || 'Failed to sync calendar')
      }

      console.log('Sync completed:', syncResult)

      // Step 2: Fetch meetings from our database
      const meetingsResponse = await fetch('/api/meetings')
      
      if (!meetingsResponse.ok) {
        throw new Error('Failed to fetch meetings')
      }

      const meetings: Meeting[] = await meetingsResponse.json()
      
      // Transform meetings to FullCalendar events
      const calendarEvents: EventInput[] = meetings.map((meeting) => ({
        id: String(meeting.google_event_id ?? `local-${Date.now()}`),
        title: meeting.title || 'Untitled Meeting',
        start: (meeting as Meeting & Partial<{ start_time: string }>).start_time,
        end: (meeting as Meeting & Partial<{ end_time: string }>).end_time ?? undefined,
        extendedProps: {
          description: meeting.description,
          attendees: meeting.attendees,
          hangoutLink: meeting.hangout_link,
        },
      }))

      setEvents(calendarEvents)
      
    } catch (err) {
      console.error('Calendar sync error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    syncAndFetchCalendar()
  }, [syncAndFetchCalendar])

  return (
    <div className="min-h-screen glass-bg">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600 mt-2">
            View your meetings with external attendees
          </p>
        </div>
        <button
          onClick={syncAndFetchCalendar}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Syncing...' : 'Refresh Calendar'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading calendar...</p>
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            height="auto"
            eventClick={(info) => {
              const event = info.event
              const extendedProps = event.extendedProps as {
                location?: string
                description?: string
                attendees?: string[]
                externalAttendees?: string[]
              }
              
              alert(`
                ${event.title}
                ${extendedProps.location ? `\nLocation: ${extendedProps.location}` : ''}
                ${extendedProps.description ? `\nDescription: ${extendedProps.description}` : ''}
                ${extendedProps.externalAttendees && extendedProps.externalAttendees.length > 0 ? `\nExternal Attendees: ${extendedProps.externalAttendees.join(', ')}` : ''}
              `)
            }}
            eventMouseEnter={(info) => {
              info.el.style.cursor = 'pointer'
            }}
          />
        )}
        </div>
      </div>
    </div>
  )
}