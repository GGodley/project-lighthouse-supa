'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import TaskDetailModal from './TaskDetailModal'

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
  const [selectedTask, setSelectedTask] = useState<NextStep | null>(null)

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
          company_id: task.company_id || null
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

  const getProgressPercentage = (priority: string) => {
    switch (priority) {
      case 'high': return 80
      case 'medium': return 50
      case 'low': return 30
      default: return 0
    }
  }

  const isCompleted = (status: string) => {
    return status === 'completed' || status === 'done'
  }

  const handleTaskUpdate = async (updatedTask: NextStep) => {
    // Update local state immediately
    setTasks(tasks.map(t => t.step_id === updatedTask.step_id ? updatedTask : t))
    if (selectedTask && selectedTask.step_id === updatedTask.step_id) {
      setSelectedTask(updatedTask)
    }
    // Refetch to ensure data is in sync
    await fetchTasks()
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
        Tasks / Next Steps
      </h3>
      <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '20rem' }}>
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No tasks at this time</p>
        ) : (
          tasks.map((task) => {
            const completed = isCompleted(task.status)
            const progress = getProgressPercentage(task.priority)
            const linkId = task.thread_id || task.meeting_id
            
            return (
              <div
                key={task.step_id}
                onClick={() => setSelectedTask(task)}
                className="relative p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-white/20 dark:border-white/10 shadow-sm hover:bg-white/70 dark:hover:bg-slate-700/60 hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer group"
              >
                {/* Bottom Pills Container */}
                <div className="absolute bottom-2 right-2 flex items-center gap-2 z-10">
                  {/* Owner Pill - show if owner exists */}
                  {task.owner && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                      Owner: {task.owner}
                    </span>
                  )}
                  
                  {/* Source Button - only show if thread_id exists */}
                  {task.thread_id && (
                    <Link
                      href={`/dashboard/customer-threads/${task.thread_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 border border-yellow-200 hover:bg-yellow-100 transition-colors"
                    >
                      Source
                    </Link>
                  )}
                </div>

                {/* Task Content */}
                <div className="flex items-center gap-3">
                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    {completed ? (
                      <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500 border-2 border-gray-300 dark:border-gray-600 rounded-full" />
                    )}
                  </div>

                  {/* Task Description */}
                  <div className="flex-1">
                    <p className={`text-sm ${completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-slate-800 dark:text-white'}`}>
                      {task.description}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal - rendered outside the map loop */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}
    </div>
  )
}

