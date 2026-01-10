'use client'

import { useEffect, useState, useCallback } from 'react'
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

  const fetchTasksWithCompanies = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Step 1: Fetch next_steps (only columns that exist in the table)
    const { data: tasksData, error: tasksError } = await supabase
      .from('next_steps')
      .select('step_id, thread_id, owner, description, status, priority')
      .eq('user_id', user.id)
      .neq('status', 'done')
      .order('priority', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(5)

    if (tasksError) throw tasksError

    // Step 2: Get company_id from thread_company_link for tasks with thread_id
    const threadIds = (tasksData || [])
      .map(t => t.thread_id)
      .filter((id): id is string => id !== null)

    let linksMap: Record<string, string> = {}
    let companiesMap: Record<string, string> = {}

    if (threadIds.length > 0) {
      // Get company_id from thread_company_link
      const { data: links } = await supabase
        .from('thread_company_link')
        .select('thread_id, company_id')
        .in('thread_id', threadIds)

      links?.forEach(link => {
        if (link.thread_id && link.company_id) {
          linksMap[link.thread_id] = link.company_id
        }
      })

      // Get company names for the company_ids we found
      const companyIds = Array.from(new Set(Object.values(linksMap)))
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('company_id, company_name')
          .in('company_id', companyIds)

        companies?.forEach(company => {
          if (company.company_id && company.company_name) {
            companiesMap[company.company_id] = company.company_name
          }
        })
      }
    }

    // Step 3: Map tasks with company_id and company_name
    return (tasksData || []).map(task => {
      const companyId = task.thread_id ? linksMap[task.thread_id] || null : null
      const companyName = companyId ? companiesMap[companyId] || null : null

      return {
        step_id: task.step_id,
        company_id: companyId,
        thread_id: task.thread_id,
        company_name: companyName,
        owner: task.owner,
        description: task.description,
        status: task.status,
        priority: task.priority
      }
    })
  }, [supabase])

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true)
        const tasksWithCompanies = await fetchTasksWithCompanies()
        setTasks(tasksWithCompanies)
      } catch (err) {
        console.error('Error fetching tasks:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [fetchTasksWithCompanies])

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
      try {
        const tasksWithCompanies = await fetchTasksWithCompanies()
        setTasks(tasksWithCompanies)
      } catch (fetchError) {
        console.error('Error refetching tasks:', fetchError)
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

