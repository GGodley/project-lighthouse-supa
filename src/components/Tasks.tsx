'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, XCircle, CheckSquare2 } from 'lucide-react'

// Task type matching the API response
type Task = {
  id: string
  description: string
  owner: string | null
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  company_id: string
  company_name: string | null
  created_at: string
}

interface TasksResponse {
  tasks: Task[]
  totalCount: number
}

type SortOption = {
  label: string
  value: 'priority' | 'due_date' | 'alphabetical'
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Priority', value: 'priority' },
  { label: 'Due Date', value: 'due_date' },
  { label: 'A-Z', value: 'alphabetical' },
]

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSort, setSelectedSort] = useState<'priority' | 'due_date' | 'alphabetical'>('priority')

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true)
        setError(null)

        const resp = await fetch(`/api/tasks?sort=${selectedSort}`, { cache: 'no-store' })
        if (!resp.ok) {
          const msg = await resp.text()
          setError(msg || 'Failed to fetch tasks')
          return
        }
        const json: TasksResponse = await resp.json()
        setTasks(json.tasks || [])
      } catch (err) {
        console.error('Error fetching tasks:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [selectedSort])

  const priorityBadgeStyles: { [key: string]: string } = {
    'high': 'bg-red-50 text-red-700 border border-red-200',
    'medium': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'low': 'bg-gray-50 text-gray-700 border border-gray-200',
  }

  const getPriorityLabel = (priority: string) => {
    return priority.charAt(0).toUpperCase() + priority.slice(1)
  }

  // Show all tasks in scrollable table
  const displayedTasks = tasks

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Next Steps</h2>
        <p className="text-sm text-gray-600 mt-1">
          Your incomplete tasks sorted by {selectedSort === 'priority' ? 'priority' : selectedSort === 'due_date' ? 'due date' : 'alphabetically'}
        </p>
        
        {/* Sort Option Pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {SORT_OPTIONS.map((option) => {
            const isSelected = selectedSort === option.value
            const handleClick = () => {
              setSelectedSort(option.value)
            }
            return (
              <button
                key={`sort-${option.value}`}
                onClick={handleClick}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-h-[450px] overflow-y-auto">
        <table className="glass-table w-full text-sm text-left rounded-xl">
            <thead className="glass-table-header sticky top-0 z-10">
              <tr className="bg-inherit">
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Task
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Company
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Priority
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Owner
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="space-y-2">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-gray-600">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p>Loading tasks...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-red-600">
                    <XCircle className="h-6 w-6 mx-auto mb-2" />
                    <p>{error}</p>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-gray-500">
                    <CheckSquare2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm mt-2">No incomplete tasks at this time.</p>
                  </td>
                </tr>
              ) : (
                displayedTasks.map((task, index) => (
                  <tr key={task.id || index} className="glass-bar-row">
                    <td className="px-6 py-5">
                      <Link 
                        href={`/dashboard/customer-threads/${task.company_id}`} 
                        className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-base"
                      >
                        {task.description || 'Untitled Task'}
                      </Link>
                    </td>
                    <td className="px-6 py-5 text-gray-700">
                      <Link 
                        href={`/dashboard/customer-threads/${task.company_id}`} 
                        className="hover:text-blue-600 transition-colors"
                      >
                        {task.company_name || 'No Company'}
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                        priorityBadgeStyles[task.priority] || 'bg-gray-100 text-gray-800'
                      }`}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-gray-600">
                      {task.owner ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {task.owner}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-gray-600">
                      {task.due_date ? (
                        new Date(task.due_date).toLocaleDateString('en-CA')
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </div>
    </div>
  )
}

export default Tasks

