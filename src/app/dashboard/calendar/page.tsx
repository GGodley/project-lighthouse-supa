'use client';

import { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput, Calendar as CalendarApi, EventClickArg, EventSourceFuncArg } from '@fullcalendar/core';

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

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);

  const handleFetchEvents = async (fetchInfo: EventSourceFuncArg, successCallback: (events: EventInput[]) => void, failureCallback: (error: Error) => void) => {
    try {
      const start = encodeURIComponent(fetchInfo.startStr);
      const end = encodeURIComponent(fetchInfo.endStr);
      
      const response = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      const items = (data as { items?: unknown[] }).items ?? [];
      const formattedEvents = formatEvents(items);
      
      successCallback(formattedEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
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


