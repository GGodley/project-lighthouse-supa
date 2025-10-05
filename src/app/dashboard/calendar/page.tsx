'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput, Calendar as CalendarApi, EventClickArg, EventSourceFuncArg } from '@fullcalendar/core';
import type { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import { useSupabase } from '@/components/SupabaseProvider'
import type { Database } from '@/types/database.types'

// Helper to format events from Google API to FullCalendar format
type GoogleEvent = {
  id?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  description?: string
  attendees?: unknown
  hangoutLink?: string
}

const formatEvents = (apiEvents: unknown[]): EventInput[] => {
  if (!Array.isArray(apiEvents)) return [];
  return (apiEvents as GoogleEvent[]).map(event => ({
    id: event.id,
    title: event.summary || 'No Title',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    extendedProps: {
      description: event.description,
      attendees: event.attendees,
      hangoutLink: event.hangoutLink,
    },
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
    textColor: 'white',
  }));
};

type MeetingRow = Database['public']['Tables']['meetings']['Row']

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const supabase = useSupabase()
  const [events, setEvents] = useState<EventInput[]>([])
  const [syncing, setSyncing] = useState<boolean>(false)

  const meetingToEvent = (m: MeetingRow): EventInput => ({
    id: String(m.id),
    title: m.summary ?? 'Meeting',
    start: m.meeting_date,
    end: m.meeting_date,
    extendedProps: { attendants: m.attendants, topics: m.topics, sentiment: m.sentiment },
  })

  const fetchMeetings = useMemo(() => async () => {
    const res = await fetch('/api/meetings')
    if (!res.ok) return
    const data = (await res.json()) as MeetingRow[]
    setEvents(data.map(meetingToEvent))
  }, [])

  const invokeSync = useMemo(() => async () => {
    try {
      setSyncing(true)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      await supabase.functions.invoke('sync-calendar', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })
    } finally {
      setSyncing(false)
    }
  }, [supabase])

  useEffect(() => {
    // kick off background sync but don't block UI
    invokeSync()
    // fetch existing meetings for immediate display
    fetchMeetings()
  }, [invokeSync, fetchMeetings])

  useEffect(() => {
    // subscribe via channel + postgres_changes events
    const channel = supabase
      .channel('meetings-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meetings' },
        (payload: RealtimePostgresInsertPayload<MeetingRow>) => {
          const record = payload.new
          setEvents((prev) => {
            const updated = prev.filter((e) => e.id !== String(record.id))
            return [...updated, meetingToEvent(record)]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings' },
        (payload: RealtimePostgresUpdatePayload<MeetingRow>) => {
          const record = payload.new
          setEvents((prev) => {
            const updated = prev.filter((e) => e.id !== String(record.id))
            return [...updated, meetingToEvent(record)]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const handleFetchEvents = async (
    _fetchInfo: EventSourceFuncArg,
    successCallback: (events: EventInput[]) => void
  ) => {
    successCallback(events)
  }

  const handleViewChange = (view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay') => {
    calendarRef.current?.getApi().changeView(view);
  };
  
  const handleEventClick = (clickInfo: EventClickArg) => {
    alert(`Event: ${clickInfo.event.title}\nTime: ${clickInfo.event.start?.toLocaleString()}`);
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <header className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Calendar</h1>
        <div className="flex items-center space-x-2 bg-white p-1 rounded-lg shadow-sm">
          <button onClick={() => handleViewChange('dayGridMonth')} className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 focus:outline-none focus:bg-gray-200">
            Month
          </button>
          <button onClick={() => handleViewChange('timeGridWeek')} className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 focus:outline-none focus:bg-gray-200">
            Week
          </button>
          <button onClick={() => handleViewChange('timeGridDay')} className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 focus:outline-none focus:bg-gray-200">
            Day
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">
            {syncing ? 'Syncing…' : 'Calendar'}
          </div>
          <button
            onClick={invokeSync}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Refresh Calendar'}
          </button>
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          events={handleFetchEvents}
          eventClick={handleEventClick}
          height="auto"
          contentHeight="auto"
        />
      </div>
    </div>
  );
}


