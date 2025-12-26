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
  company_name: string | null
}

const STATUS_CONFIG = {
  todo: { 
    label: 'To Do', 
    color: 'bg-slate-800 text-white border border-slate-700 shadow-sm shadow-slate-200 font-bold' 
  },
  in_progress: { 
    label: 'In Progress', 
    color: 'bg-blue-500 text-white border border-blue-400 shadow-sm shadow-blue-200 font-bold' 
  },
  blocked: { 
    label: 'Blocked', 
    color: 'bg-pink-500 text-white border border-pink-400 shadow-sm shadow-pink-200 font-bold' 
  },
  done: { 
    label: 'Done', 
    color: 'bg-emerald-500 text-white border border-emerald-400 shadow-sm shadow-emerald-200 font-bold' 
  },
}

const PRIORITY_CONFIG = {
  high: { 
    label: 'High', 
    color: 'bg-rose-500 text-white border border-rose-400 font-bold' 
  },
  medium: { 
    label: 'Medium', 
    color: 'bg-yellow-400 text-yellow-900 border border-yellow-300 font-bold' 
  },
  low: { 
    label: 'Low', 
    color: 'bg-teal-500 text-white border border-teal-400 font-bold' 
  },
}

const formatDueDate = (dateString: string | null) => {
  if (!dateString) return null
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return null
  }
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

  const isCompleted = (status: string) => {
    return status === 'completed' || status === 'done'
  }

  const getStatusLabel = (status: string) => {
    const statusLower = (status || '').toLowerCase().trim()
    const statusKey = Object.keys(STATUS_CONFIG).find(key => key.toLowerCase() === statusLower)
    return statusKey ? STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG].label : status
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
      <h3 className="text-lg font-semibold mb-4">
        Tasks / Next Steps
      </h3>
      <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '20rem' }}>
        {loading ? (
          <p className="text-sm">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm">No tasks at this time</p>
        ) : (
          tasks.map((task) => {
            const completed = isCompleted(task.status)
            const dueDateFormatted = formatDueDate(task.due_date)
            const statusLower = (task.status || '').toLowerCase().trim()
            const statusKey = Object.keys(STATUS_CONFIG).find(key => key.toLowerCase() === statusLower)
            const statusColor = statusKey ? STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG].color : 'bg-slate-800 text-white border border-slate-700 shadow-sm shadow-slate-200 font-bold'
            const statusLabel = statusKey ? STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG].label : task.status
            const priorityKey = task.priority as keyof typeof PRIORITY_CONFIG
            const priorityColor = PRIORITY_CONFIG[priorityKey] ? PRIORITY_CONFIG[priorityKey].color : 'bg-teal-500 text-white border border-teal-400 font-bold'
            const priorityLabel = PRIORITY_CONFIG[priorityKey] ? PRIORITY_CONFIG[priorityKey].label : task.priority
            
            return (
              <div
                key={task.step_id}
                onClick={() => setSelectedTask(task)}
                className="glass-bar-row relative p-4 cursor-pointer group"
              >
                {/* Due Date - Top Right */}
                {dueDateFormatted && (
                  <div className="absolute top-2 right-2 text-xs text-slate-500">
                    {dueDateFormatted}
                  </div>
                )}

                {/* Task Content */}
                <div className="flex items-start gap-3 pr-16">
                  {/* Checkbox */}
                  <div className="flex-shrink-0 mt-0.5">
                    {completed ? (
                      <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 border-2 border-gray-300 rounded-full" />
                    )}
                  </div>

                  {/* Task Description and Pills */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm mb-2 ${completed ? 'line-through opacity-60' : ''}`}>
                      {task.description}
                    </p>
                    
                    {/* Pill Row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Priority */}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor}`}>
                        {priorityLabel}
                      </span>
                      
                      {/* Status */}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
                        {statusLabel}
                      </span>
                      
                      {/* Source */}
                      {task.thread_id && (
                        <Link
                          href={`/dashboard/customer-threads/${task.thread_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 font-bold hover:bg-yellow-200 transition-colors"
                        >
                          Source
                        </Link>
                      )}
                      
                      {/* Owner */}
                      {task.owner && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-medium">
                          {task.owner}
                        </span>
                      )}
                      
                      {/* Company */}
                      {task.company_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                          {task.company_name}
                        </span>
                      )}
                    </div>
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

