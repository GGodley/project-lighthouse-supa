'use client'

import { useEffect, useState } from 'react'
import { NextStepCard, type NextStepStatus } from '@/components/ui/NextStepCard'
import { useSupabase } from '@/components/SupabaseProvider'
import { SourcePreviewModal } from '@/components/modals/SourcePreviewModal'

interface NextStep {
  step_id: string
  description: string
  owner: string | null
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  status: string
  thread_id: string | null
  meeting_id: string | null
  company_id: string | null
  company_name: string | null
}

interface TaskResponse {
  step_id: string
  description: string
  owner: string | null
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  status: string
  company_id: string | null
  company_name: string | null
  thread_id: string | null
  meeting_id: string | null
  created_at: string
}

interface TasksApiResponse {
  tasks: TaskResponse[]
  totalCount: number
}

export default function TasksNextSteps() {
  const [tasks, setTasks] = useState<NextStep[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<{
    id: string
    type: 'meeting' | 'thread' | 'manual'
    companyId: string | null
  } | null>(null)
  const supabase = useSupabase()

  // Helper function to map status to NextStepCard status
  const mapStepStatus = (status: string | null | undefined): NextStepStatus => {
    if (!status) return 'todo';
    const statusLower = status.toLowerCase().trim();
    if (statusLower === 'in_progress' || statusLower === 'in-progress') return 'in_progress';
    if (statusLower === 'done' || statusLower === 'completed') return 'done';
    return 'todo';
  };

  // Helper function to format priority
  const formatPriority = (priority: string | null | undefined): string => {
    if (!priority) return 'No priority';
    return `Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`;
  };

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/tasks?sort=priority', { cache: 'no-store' })
      
      if (response.ok) {
        const data: TasksApiResponse = await response.json()
        // Map the API response to our NextStep format
        const mappedTasks: NextStep[] = (data.tasks || []).map((task: TaskResponse) => ({
          step_id: task.step_id,
          description: task.description,
          owner: task.owner || null,
          due_date: task.due_date || null,
          priority: task.priority || 'low',
          status: task.status || 'pending',
          thread_id: task.thread_id || null,
          meeting_id: task.meeting_id || null,
          company_id: task.company_id || null,
          company_name: task.company_name || null
        }))
        setTasks(mappedTasks)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  // Handle status update
  const handleStatusUpdate = async (stepId: string, newStatus: NextStepStatus) => {
    // Optimistic update
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.step_id === stepId 
          ? { ...task, status: newStatus }
          : task
      )
    );

    // Update in database
    const { error } = await supabase
      .from('next_steps')
      .update({ status: newStatus })
      .eq('step_id', stepId);

    if (error) {
      console.error('Error updating status:', error);
      // Revert on error by refetching
      await fetchTasks();
    }
  };

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold mb-4">
        Tasks / Next Steps
      </h3>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-y-auto flex-1 min-h-0">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <p className="text-sm text-gray-500">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <p className="text-sm text-gray-500">No tasks at this time</p>
          </div>
        ) : (
          tasks.map((task) => (
            <NextStepCard
              key={task.step_id}
              variant="default"
              status={mapStepStatus(task.status)}
              companyName={task.company_name || task.owner || "Unassigned"}
              contactName={formatPriority(task.priority)}
              description={task.description}
              onStatusChange={(newStatus) => handleStatusUpdate(task.step_id, newStatus)}
              onGoToSource={
                task.meeting_id
                  ? () => {
                      setSelectedSource({
                        id: task.meeting_id!,
                        type: 'meeting',
                        companyId: task.company_id,
                      })
                    }
                  : task.thread_id
                  ? () => {
                      setSelectedSource({
                        id: task.thread_id!,
                        type: 'thread',
                        companyId: task.company_id,
                      })
                    }
                  : () => {
                      setSelectedSource({
                        id: '',
                        type: 'manual',
                        companyId: task.company_id,
                      })
                    }
              }
            />
          ))
        )}
      </div>
      <SourcePreviewModal
        isOpen={!!selectedSource}
        onClose={() => setSelectedSource(null)}
        sourceId={selectedSource?.id || ''}
        sourceType={selectedSource?.type || 'manual'}
        companyId={selectedSource?.companyId || null}
      />
    </div>
  )
}
