'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

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

interface TaskDetailModalProps {
  task: NextStep
  onClose: () => void
  onUpdate: (task: NextStep) => void
}

const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'bg-slate-200 text-slate-700' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700' },
  done: { label: 'Done', color: 'bg-emerald-100 text-emerald-700' },
}

export default function TaskDetailModal({ task, onClose, onUpdate }: TaskDetailModalProps) {
  const [localTask, setLocalTask] = useState<NextStep>(task)
  const [isUpdating, setIsUpdating] = useState(false)

  // Update local task when prop changes
  useEffect(() => {
    setLocalTask(task)
  }, [task])

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const updateTask = async (updates: Partial<NextStep>) => {
    if (!localTask.company_id) {
      console.error('Cannot update task: missing company_id')
      return
    }

    // Store previous state for potential revert
    const previousTask = { ...localTask }
    const updatedTask = { ...localTask, ...updates }
    setLocalTask(updatedTask)

    try {
      setIsUpdating(true)
      const response = await fetch(`/api/companies/${localTask.company_id}/next-steps/${localTask.step_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to update task')
      }

      const data = await response.json()
      const finalTask = {
        ...updatedTask,
        ...data,
      }
      setLocalTask(finalTask)
      onUpdate(finalTask)
    } catch (error) {
      console.error('Error updating task:', error)
      // Revert on error
      setLocalTask(previousTask)
      // Show error to user (you could add a toast notification here)
      alert('Failed to update task. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!localTask.company_id) {
      console.error('Cannot update task: missing company_id')
      return
    }

    const previousStatus = localTask.status
    // Optimistic update - change color immediately
    setLocalTask({ ...localTask, status: newStatus })

    try {
      setIsUpdating(true)
      const response = await fetch(`/api/companies/${localTask.company_id}/next-steps/${localTask.step_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      const data = await response.json()
      const finalTask = {
        ...localTask,
        status: newStatus,
        ...data,
      }
      setLocalTask(finalTask)
      onUpdate(finalTask)
    } catch (error) {
      console.error('Error updating status:', error)
      // Revert on error - restore previous status color
      setLocalTask({ ...localTask, status: previousStatus })
      alert('Failed to update status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleFieldBlur = (field: keyof NextStep, value: string | null) => {
    if (localTask[field] !== value) {
      updateTask({ [field]: value })
    }
  }

  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      return date.toISOString().split('T')[0]
    } catch {
      return ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Task Details
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-gray-600 dark:text-gray-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={localTask.description}
              onChange={(e) => setLocalTask({ ...localTask, description: e.target.value })}
              onBlur={(e) => handleFieldBlur('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isUpdating}
            />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Owner
            </label>
            <input
              type="text"
              value={localTask.owner || ''}
              onChange={(e) => setLocalTask({ ...localTask, owner: e.target.value || null })}
              onBlur={(e) => handleFieldBlur('owner', e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUpdating}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Due Date
            </label>
            <input
              type="date"
              value={formatDateForInput(localTask.due_date)}
              onChange={(e) => {
                const value = e.target.value || null
                setLocalTask({ ...localTask, due_date: value })
                handleFieldBlur('due_date', value)
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUpdating}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Priority
            </label>
            <select
              value={localTask.priority}
              onChange={(e) => {
                const value = e.target.value as 'high' | 'medium' | 'low'
                setLocalTask({ ...localTask, priority: value })
                updateTask({ priority: value })
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUpdating}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Status Pills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([statusKey, config]) => {
                const isSelected = localTask.status === statusKey
                return (
                  <button
                    key={statusKey}
                    onClick={() => handleStatusChange(statusKey)}
                    disabled={isUpdating}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      isSelected
                        ? `${config.color} ring-2 ring-offset-2 scale-105 font-bold shadow-sm`
                        : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100 grayscale opacity-70'
                    } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

