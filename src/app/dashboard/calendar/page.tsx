'use client'

import { useState, useEffect, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import { EventInput } from '@fullcalendar/core'

// Type for meeting response from API
type MeetingResponse = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  attendees: string[] | null;
  hangout_link: string | null;
  bot_enabled: boolean | null;
};

type MeetingsApiResponse = {
  meetings: MeetingResponse[];
};

export default function CalendarPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<EventInput[]>([])
  const [error, setError] = useState<string | null>(null)

  // Fetch meetings from database (without syncing)
  const fetchMeetings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const meetingsResponse = await fetch('/api/meetings')
      
      if (!meetingsResponse.ok) {
        throw new Error('Failed to fetch meetings')
      }

      const data: MeetingsApiResponse = await meetingsResponse.json()
      const { meetings } = data;
      
      // Transform meetings to FullCalendar events
      // Filter out meetings without start_time (can't display on calendar)
      // Convert null to undefined for FullCalendar EventInput type compatibility
      const calendarEvents: EventInput[] = meetings
        .filter((meeting: MeetingResponse) => meeting.start_time !== null)
        .map((meeting: MeetingResponse) => ({
          id: String(meeting.id || `local-${Date.now()}`),
          title: meeting.title || 'Untitled Meeting',
          start: meeting.start_time ?? undefined, // Convert null to undefined
          end: meeting.end_time ?? undefined, // Convert null to undefined
          extendedProps: {
            meetingId: meeting.id,
            description: meeting.description,
            attendees: meeting.attendees,
            hangoutLink: meeting.hangout_link,
            botEnabled: meeting.bot_enabled ?? true,
          },
        }))

      setEvents(calendarEvents)
      
    } catch (err) {
      console.error('Error fetching meetings:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Sync and fetch calendar (for manual refresh button)
  const syncAndFetchCalendar = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Call sync-calendar API route (triggers Trigger.dev task)
      const syncResponse = await fetch('/api/sync-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json()
        throw new Error(errorData.error || 'Failed to sync calendar')
      }

      const syncResult = await syncResponse.json()
      console.log('Sync initiated:', syncResult)

      // Wait a bit for initial processing, then fetch meetings
      // Note: Trigger.dev processes in background, so we fetch what's available
      setTimeout(() => {
        fetchMeetings()
      }, 2000)
      
    } catch (err) {
      console.error('Calendar sync error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsLoading(false)
    }
  }, [fetchMeetings])

  // Fetch meetings on page load (without syncing)
  // Note: Auto-sync on page load has been moved to DashboardSyncManager
  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

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
                meetingId?: string
                location?: string
                description?: string
                attendees?: string[]
                externalAttendees?: string[]
                botEnabled?: boolean
              }
              
              // Create a modal/dialog to show meeting details with bot toggle
              const modal = document.createElement('div')
              modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
              modal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h2 class="text-xl font-bold mb-4">${event.title}</h2>
                  <div class="space-y-2 mb-4">
                    ${extendedProps.description ? `<p class="text-gray-600">${extendedProps.description}</p>` : ''}
                    ${extendedProps.attendees && extendedProps.attendees.length > 0 ? `<p class="text-sm text-gray-500">Attendees: ${Array.isArray(extendedProps.attendees) ? extendedProps.attendees.join(', ') : ''}</p>` : ''}
                  </div>
                  <div id="bot-toggle-container" class="mb-4"></div>
                  <button id="close-modal" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Close</button>
                </div>
              `
              document.body.appendChild(modal)
              
              // Add bot toggle if meetingId exists
              if (extendedProps.meetingId) {
                const toggleContainer = modal.querySelector('#bot-toggle-container')
                if (toggleContainer) {
                  // We'll use React to render the toggle, but for simplicity, we'll use a basic implementation
                  // In a production app, you'd use a proper modal component with React
                  const toggleDiv = document.createElement('div')
                  toggleDiv.innerHTML = `
                    <label class="flex items-center gap-2">
                      <input type="checkbox" id="bot-toggle-checkbox" ${extendedProps.botEnabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                      <span class="text-sm text-gray-700">Bot Enabled</span>
                    </label>
                  `
                  toggleContainer.appendChild(toggleDiv)
                  
                  const checkbox = toggleDiv.querySelector('#bot-toggle-checkbox') as HTMLInputElement
                  checkbox?.addEventListener('change', async () => {
                    try {
                      const response = await fetch(`/api/meetings/${extendedProps.meetingId}/bot-toggle`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bot_enabled: checkbox.checked }),
                      })
                      if (!response.ok) {
                        throw new Error('Failed to update')
                      }
                    } catch {
                      checkbox.checked = !checkbox.checked // Revert on error
                      alert('Failed to update bot setting')
                    }
                  })
                }
              }
              
              modal.querySelector('#close-modal')?.addEventListener('click', () => {
                document.body.removeChild(modal)
              })
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