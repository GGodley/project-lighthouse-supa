'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/Button'
import { Plus, Calendar, Clock, Users } from 'lucide-react'

type Meeting = Database['public']['Tables']['meetings']['Row']
type Customer = Database['public']['Tables']['customers']['Row']

interface MeetingWithCustomer extends Meeting {
  customer: Customer | null
}

export default function EventsPage() {
  const [events, setEvents] = useState<MeetingWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming')
  const supabase = useSupabase()

  const fetchEvents = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('meetings')
        .select(`
          *,
          customer:customers(*)
        `)
        .eq('user_id', user.id)
        .order('meeting_date', { ascending: true })

      if (view === 'upcoming') {
        query = query.gte('meeting_date', new Date().toISOString())
      }

      const { data, error } = await query

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, view])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents, view])


  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const groupEventsByDate = (events: MeetingWithCustomer[]) => {
    const grouped: { [key: string]: MeetingWithCustomer[] } = {}
    
    events.forEach(event => {
      const date = new Date(event.meeting_date).toDateString()
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(event)
    })
    
    return grouped
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  const groupedEvents = groupEventsByDate(events)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Events</h1>
          <p className="text-gray-600">Manage your meetings, calls, and tasks</p>
        </div>
        <div className="flex space-x-3">
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setView('upcoming')}
              className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                view === 'upcoming'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setView('all')}
              className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                view === 'all'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Events
            </button>
          </div>
          <Button className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Event</span>
          </Button>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-6">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500">
              {view === 'upcoming'
                ? 'No upcoming events scheduled'
                : 'No events found. Create your first event to get started.'}
            </div>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([date, dayEvents]) => (
            <div key={date} className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{date}</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {dayEvents.map((event) => {
                  const meetingTime = formatDate(event.meeting_date)
                  
                  return (
                    <div key={event.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="p-2 rounded-full bg-blue-100 text-blue-800">
                              <Users className="w-4 h-4" />
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900">Meeting</h4>
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              Meeting
                            </span>
                          </div>
                          {event.summary && (
                            <p className="text-gray-600 mb-3">{event.summary}</p>
                          )}
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-4 h-4" />
                              <span>{meetingTime.time}</span>
                            </div>
                            {event.customer && (
                              <span>Customer: <span className="font-medium text-gray-900">{event.customer.name}</span></span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
