'use client'

import { useRef, useState } from 'react'
import FullCalendar, { type EventSourceFunc, type DatesSetArg } from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import { Button } from '@/components/ui/Button'

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null)
  const [currentViewTitle, setCurrentViewTitle] = useState<string>('')

  const fetchEvents: EventSourceFunc = async (info, successCallback, failureCallback) => {
    try {
      const url = new URL('/api/calendar/events', window.location.origin)
      url.searchParams.set('start', info.startStr)
      url.searchParams.set('end', info.endStr)

      const res = await fetch(url.toString())
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to fetch events')
      }
      const data = await res.json()

      const events = (data.events || []).map((e: any) => ({
        id: e.id,
        title: e.summary || 'Untitled Event',
        start: e.start?.dateTime || e.start?.date, // all-day fallback
        end: e.end?.dateTime || e.end?.date,
        extendedProps: e,
      }))

      successCallback(events)
    } catch (error) {
      failureCallback?.(error as Error)
    }
  }

  const handleDatesSet = (arg: DatesSetArg) => {
    setCurrentViewTitle(arg.view.title)
  }

  const changeView = (viewName: 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth') => {
    // @ts-expect-error access internal API instance via calendarRef
    const api = calendarRef.current?.getApi?.() || (calendarRef.current as any)?.getApi?.()
    api?.changeView(viewName)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600">View and manage your upcoming schedule.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => changeView('timeGridDay')}>Day</Button>
          <Button onClick={() => changeView('timeGridWeek')}>Week</Button>
          <Button onClick={() => changeView('dayGridMonth')}>Month</Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="mb-3 text-lg font-semibold text-gray-900">{currentViewTitle}</div>
        {/* Note: FullCalendar styles may require importing CSS in globals.css for best appearance */}
        <FullCalendar
          ref={calendarRef as any}
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="auto"
          weekends={true}
          nowIndicator={true}
          navLinks={true}
          selectable={false}
          events={fetchEvents}
          datesSet={handleDatesSet}
          eventDisplay="block"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit' }}
          slotMinTime="06:00:00"
          slotMaxTime="20:00:00"
          displayEventEnd={true}
          dayMaxEventRows={3}
        />
      </div>
    </div>
  )
}


