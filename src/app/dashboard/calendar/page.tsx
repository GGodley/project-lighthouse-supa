'use client';

// ⚠️ THIS IS THE DEFINITIVE AND CORRECTED CALENDAR PAGE COMPONENT (v2) ⚠️

import { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput, Calendar as CalendarApi, EventClickArg } from '@fullcalendar/core';

// Helper to format events from Google API to FullCalendar format
const formatEvents = (apiEvents: unknown[]): EventInput[] => {
  if (!Array.isArray(apiEvents)) return [];
  return apiEvents.map((event: any) => ({
    id: event.id,
    title: event.summary || 'No Title',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    extendedProps: {
      description: event.description,
      attendees: event.attendees,
      hangoutLink: event.hangoutLink,
    },
    // Default styling
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
    textColor: 'white',
  }));
};

export default function CalendarPage() {
  const calendarRef = useRef<{ getApi: () => CalendarApi } | null>(null);

  // FullCalendar event source function
  const handleFetchEvents = async (
    fetchInfo: { startStr: string; endStr: string },
    successCallback: (events: EventInput[]) => void,
    failureCallback: (error: Error) => void
  ) => {
    try {
      const start = encodeURIComponent(fetchInfo.startStr);
      const end = encodeURIComponent(fetchInfo.endStr);

      const response = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.items ?? []);
      const formattedEvents = formatEvents(list);
      successCallback(formattedEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
      failureCallback(error as Error);
    }
  };

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
        <FullCalendar
          ref={calendarRef as any}
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

//
// ⚠️ THIS IS THE DEFINITIVE AND CORRECTED CALENDAR PAGE COMPONENT (v2) ⚠️
//
'use client';

import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput, Calendar as CalendarApi } from '@fullcalendar/core';
import type { EventClickArg } from '@fullcalendar/core';

// Helper to format events from Google API to FullCalendar format
const formatEvents = (apiEvents: any[]): EventInput[] => {
  if (!Array.isArray(apiEvents)) return [];
  return apiEvents.map(event => ({
    id: event.id,
    title: event.summary || 'No Title',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    extendedProps: {
      description: event.description,
      attendees: event.attendees,
      hangoutLink: event.hangoutLink,
    },
    // Add some default styling
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
    textColor: 'white',
  }));
};

export default function CalendarPage() {
  const calendarRef = useRef<{ getApi: () => CalendarApi } | null>(null);

  // This function is what FullCalendar will call to get events
  const handleFetchEvents = async (fetchInfo: { startStr: string; endStr: string; }, successCallback: (events: EventInput[]) => void, failureCallback: (error: Error) => void) => {
    try {
      const start = encodeURIComponent(fetchInfo.startStr);
      const end = encodeURIComponent(fetchInfo.endStr);
      
      const response = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
      }

      const data = await response.json();
      // Google Calendar API returns events in an 'items' array
      const formattedEvents = formatEvents(data.items || []);
      
      successCallback(formattedEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      failureCallback(error as Error);
    }
  };

  const handleViewChange = (view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay') => {
    if (calendarRef.current) {
      calendarRef.current.getApi().changeView(view);
    }
  };
  
  const handleEventClick = (clickInfo: EventClickArg) => {
    // Example interaction: show an alert with event details
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
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false} // We use our own custom header
          events={handleFetchEvents}
          eventClick={handleEventClick}
          height="auto" // Adjusts height to content
          contentHeight="auto"
        />
      </div>
    </div>
  );
}
'//
'// ⚠️ THIS IS THE DEFINITIVE AND CORRECTED CALENDAR PAGE COMPONENT ⚠️
'//
'use client';

import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput, Calendar } from '@fullcalendar/core';

// Helper function to format event data for FullCalendar
const formatEvents = (events: any[]): EventInput[] => {
  if (!Array.isArray(events)) return [];
  return events.map(event => ({
    id: event.id,
    title: event.summary,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    extendedProps: {
      description: event.description,
      attendees: event.attendees,
      hangoutLink: event.hangoutLink,
    },
  }));
};

export default function CalendarPage() {
  const calendarRef = useRef<Calendar | null>(null);

  // This function is what FullCalendar will call to get events
  const fetchEvents = async (fetchInfo: any, successCallback: (events: EventInput[]) => void, failureCallback: (error: Error) => void) => {
    try {
      const start = fetchInfo.startStr;
      const end = fetchInfo.endStr;
      
      const response = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      // We expect the API to return an object with an 'items' array
      const data = await response.json();
      const formattedEvents = formatEvents(data.items || []);
      
      successCallback(formattedEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      failureCallback(error as Error);
    }
  };

  const handleViewChange = (view: string) => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.changeView(view);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Calendar</h1>
        <div className="flex items-center space-x-2">
          <button onClick={() => handleViewChange('dayGridMonth')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Month
          </button>
          <button onClick={() => handleViewChange('timeGridWeek')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Week
          </button>
          <button onClick={() => handleViewChange('timeGridDay')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Day
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-lg shadow">
        <FullCalendar
          ref={(ref) => {
            if (ref) {
              calendarRef.current = ref.getApi();
            }
          }}
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false} // We are using our own header
          events={fetchEvents}
          height="auto"
          eventColor="#4f46e5"
        />
      </div>
    </div>
  );
}
'use client'

import { useRef, useState } from 'react'
import FullCalendar, { type EventSourceFunc, type DatesSetArg } from '@fullcalendar/react'
import type { EventInput } from '@fullcalendar/core'
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
      const data: { events: unknown[] } = await res.json()

      const events: EventInput[] = (data.events ?? []).map((raw: unknown): EventInput => {
        const e = raw as {
          id?: string
          summary?: string
          start?: { dateTime?: string; date?: string }
          end?: { dateTime?: string; date?: string }
        }
        return {
          id: e?.id,
          title: e?.summary || 'Untitled Event',
          start: e?.start?.dateTime || e?.start?.date,
          end: e?.end?.dateTime || e?.end?.date,
          extendedProps: raw,
        }
      })

      successCallback(events)
    } catch (error) {
      if (failureCallback) failureCallback(error as Error)
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


