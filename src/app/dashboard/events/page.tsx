'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Plus, Calendar, Clock, Users, Phone, Mail, CheckCircle, XCircle } from 'lucide-react'

type Event = Database['public']['Tables']['events']['Row']
type Client = Database['public']['Tables']['clients']['Row']

interface EventWithClient extends Event {
  client: Client | null
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming')
  const supabase = createClient()

  useEffect(() => {
    fetchEvents()
  }, [view])

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('events')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('user_id', user.id)
        .order('start_date', { ascending: true })

      if (view === 'upcoming') {
        query = query.gte('start_date', new Date().toISOString())
      }

      const { data, error } = await query

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'meeting': return <Users className="w-4 h-4" />
      case 'call': return <Phone className="w-4 h-4" />
      case 'email': return <Mail className="w-4 h-4" />
      case 'task': return <CheckCircle className="w-4 h-4" />
      default: return <Calendar className="w-4 h-4" />
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'meeting': return 'bg-blue-100 text-blue-800'
      case 'call': return 'bg-green-100 text-green-800'
      case 'email': return 'bg-purple-100 text-purple-800'
      case 'task': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const groupEventsByDate = (events: EventWithClient[]) => {
    const grouped: { [key: string]: EventWithClient[] } = {}
    
    events.forEach(event => {
      const date = new Date(event.start_date).toDateString()
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
                  const startTime = formatDate(event.start_date)
                  const endTime = formatDate(event.end_date)
                  
                  return (
                    <div key={event.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className={`p-2 rounded-full ${getEventColor(event.type)}`}>
                              {getEventIcon(event.type)}
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900">{event.title}</h4>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEventColor(event.type)}`}>
                              {event.type}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(event.status)}`}>
                              {event.status}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-gray-600 mb-3">{event.description}</p>
                          )}
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-4 h-4" />
                              <span>{startTime.time} - {endTime.time}</span>
                            </div>
                            {event.client && (
                              <span>Client: <span className="font-medium text-gray-900">{event.client.name}</span></span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {event.status === 'scheduled' && (
                            <Button size="sm" variant="outline">
                              Mark Complete
                            </Button>
                          )}
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
