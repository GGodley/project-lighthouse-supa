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
  company_name: string | null
}

interface TaskDetailModalProps {
  task: NextStep
  onClose: () => void
  onUpdate: (task: NextStep) => void
}

const STATUS_CONFIG = {
  todo: { 
    label: 'To Do', 
    color: 'bg-slate-800 text-white border border-slate-700 shadow-sm shadow-slate-200' 
  },
  in_progress: { 
    label: 'In Progress', 
    color: 'bg-blue-500 text-white border border-blue-400 shadow-sm shadow-blue-200' 
  },
  blocked: { 
    label: 'Blocked', 
    color: 'bg-pink-500 text-white border border-pink-400 shadow-sm shadow-pink-200' 
  },
  done: { 
    label: 'Done', 
    color: 'bg-emerald-500 text-white border border-emerald-400 shadow-sm shadow-emerald-200' 
  },
}

const PRIORITY_CONFIG = {
  high: { 
    label: 'High', 
    color: 'bg-rose-500 text-white border border-rose-400' 
  },
  medium: { 
    label: 'Medium', 
    color: 'bg-yellow-400 text-yellow-900 border border-yellow-300' 
  },
  low: { 
    label: 'Low', 
    color: 'bg-teal-500 text-white border border-teal-400' 
  },
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
    const previousStatus = localTask.status
    // Optimistic update - change color immediately
    setLocalTask({ ...localTask, status: newStatus })

    try {
      await updateTask({ status: newStatus })
    } catch {
      // Revert on error
      setLocalTask({ ...localTask, status: previousStatus })
    }
  }

  const handleFieldBlur = (field: keyof NextStep, value: string | null) => {
    if (localTask[field] !== value) {
      updateTask({ [field]: value })
    }
  }

  const handlePriorityChange = async (newPriority: 'high' | 'medium' | 'low') => {
    const previousPriority = localTask.priority
    // Optimistic update
    setLocalTask({ ...localTask, priority: newPriority })

    try {
      await updateTask({ priority: newPriority })
    } catch {
      // Revert on error
      setLocalTask({ ...localTask, priority: previousPriority })
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

  const handleSave = async () => {
    // Save all pending changes
    if (localTask.company_id) {
      const updates: Partial<NextStep> = {}
      if (localTask.description !== task.description) updates.description = localTask.description
      if (localTask.owner !== task.owner) updates.owner = localTask.owner
      if (localTask.due_date !== task.due_date) updates.due_date = localTask.due_date
      if (localTask.priority !== task.priority) updates.priority = localTask.priority
      if (localTask.status !== task.status) updates.status = localTask.status

      if (Object.keys(updates).length > 0) {
        await updateTask(updates)
      }
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Modal Container */}
      <div className="glass-modal p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            Task Details
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={localTask.description}
              onChange={(e) => setLocalTask({ ...localTask, description: e.target.value })}
              onBlur={(e) => handleFieldBlur('description', e.target.value)}
              rows={3}
              className="glass-input w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isUpdating}
            />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Owner
            </label>
            <input
              type="text"
              value={localTask.owner || ''}
              onChange={(e) => setLocalTask({ ...localTask, owner: e.target.value || null })}
              onBlur={(e) => handleFieldBlur('owner', e.target.value || null)}
              className="glass-input w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUpdating}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium mb-2">
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
              className="glass-input w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUpdating}
            />
          </div>

          {/* Priority Pills */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Priority
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PRIORITY_CONFIG).map(([priorityKey, config]) => {
                const isSelected = localTask.priority === priorityKey
                return (
                  <button
                    key={priorityKey}
                    onClick={() => handlePriorityChange(priorityKey as 'high' | 'medium' | 'low')}
                    disabled={isUpdating}
                    className={`px-4 py-2 rounded-full text-sm transition-all ${
                      isSelected
                        ? `${config.color} ring-2 ring-offset-2 ring-gray-300 transform scale-105 font-bold shadow-sm`
                        : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
                    } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status Pills */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Status
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([statusKey, config]) => {
                // Normalize both to lowercase strings for comparison
                const currentStatus = (localTask.status || '').toLowerCase().trim()
                const statusKeyLower = statusKey.toLowerCase().trim()
                const isSelected = currentStatus === statusKeyLower
                return (
                  <button
                    key={statusKey}
                    onClick={() => handleStatusChange(statusKey)}
                    disabled={isUpdating}
                    className={`px-4 py-2 rounded-full text-sm transition-all ${
                      isSelected
                        ? `${config.color} ring-2 ring-offset-2 ring-gray-300 transform scale-105 font-bold shadow-sm`
                        : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
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

