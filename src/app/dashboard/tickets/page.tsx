'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Plus, Search, MoreVertical, Clock, AlertTriangle, CheckCircle } from 'lucide-react'

type Ticket = Database['public']['Tables']['tickets']['Row']
type Client = Database['public']['Tables']['clients']['Row']

interface TicketWithClient extends Ticket {
  client: Client
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const supabase = createClient()

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTickets(data || [])
    } catch (error) {
      console.error('Error fetching tickets:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.client.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter
    
    return matchesSearch && matchesStatus && matchesPriority
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800'
      case 'resolved': return 'bg-green-100 text-green-800'
      case 'closed': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertTriangle className="w-4 h-4" />
      case 'high': return <AlertTriangle className="w-4 h-4" />
      case 'medium': return <Clock className="w-4 h-4" />
      case 'low': return <CheckCircle className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tickets</h1>
          <p className="text-gray-600">Manage support tickets and client issues</p>
        </div>
        <Button className="flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>Create Ticket</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {filteredTickets.map((ticket) => (
          <div key={ticket.id} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{ticket.title}</h3>
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority)}`}>
                    {getPriorityIcon(ticket.priority)}
                    <span className="ml-1">{ticket.priority}</span>
                  </span>
                </div>
                <p className="text-gray-600 mb-3">{ticket.description}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>Client: <span className="font-medium text-gray-900">{ticket.client.name}</span></span>
                  <span>Created: {new Date(ticket.created_at).toLocaleDateString()}</span>
                  {ticket.due_date && (
                    <span>Due: {new Date(ticket.due_date).toLocaleDateString()}</span>
                  )}
                  {ticket.assigned_to && (
                    <span>Assigned to: <span className="font-medium text-gray-900">{ticket.assigned_to}</span></span>
                  )}
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {filteredTickets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500">
            {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'No tickets match your filters' 
              : 'No tickets found. Create your first ticket to get started.'}
          </div>
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
