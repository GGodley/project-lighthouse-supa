'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { NextStepCard, NextStepStatus } from '@/components/ui/NextStepCard'

interface NextStep {
  step_id: string
  company_id: string | null
  thread_id: string | null
  company_name: string | null
  owner: string | null
  description: string
  status: string
  priority: string | null
}

export default function DashboardTasksList() {
  const [tasks, setTasks] = useState<NextStep[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('next_steps')
          .select('step_id, company_id, thread_id, company_name, owner, description, status, priority')
          .eq('user_id', user.id)
          .neq('status', 'done')
          .order('priority', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) throw error
        setTasks(data || [])
      } catch (err) {
        console.error('Error fetching tasks:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [supabase])

  const mapStepStatus = (status: string): NextStepStatus => {
    if (status === 'done') return 'done'
    if (status === 'in_progress') return 'in_progress'
    return 'todo'
  }

  const formatPriority = (priority: string | null): string => {
    if (!priority) return 'Normal'
    return priority.charAt(0).toUpperCase() + priority.slice(1)
  }

  const handleStatusUpdate = async (stepId: string, newStatus: NextStepStatus) => {
    // Optimistic update
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.step_id === stepId 
          ? { ...task, status: newStatus }
          : task
      )
    )

    // Update in database
    const { error } = await supabase
      .from('next_steps')
      .update({ status: newStatus })
      .eq('step_id', stepId)

    if (error) {
      console.error('Error updating status:', error)
      // Refetch on error
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('next_steps')
          .select('step_id, company_id, thread_id, company_name, owner, description, status, priority')
          .eq('user_id', user.id)
          .neq('status', 'done')
          .order('priority', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(5)
        if (data) setTasks(data)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading tasks...</p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No priority tasks at this time
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <NextStepCard
          key={task.step_id}
          variant="compact"
          status={mapStepStatus(task.status)}
          companyName={task.company_name || task.owner || "Unassigned"}
          contactName={formatPriority(task.priority)}
          description={task.description}
          onStatusChange={(newStatus) => handleStatusUpdate(task.step_id, newStatus)}
          onGoToSource={task.company_id && task.thread_id ? () => {
            window.location.href = `/dashboard/customer-threads/${task.company_id}?thread=${task.thread_id}`;
          } : task.company_id ? () => {
            window.location.href = `/dashboard/customer-threads/${task.company_id}`;
          } : undefined}
        />
      ))}
    </div>
  )
}

