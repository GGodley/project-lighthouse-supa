'use client'

import { useState } from 'react'

interface MeetingBotToggleProps {
  meetingId: string
  initialEnabled: boolean
  onToggle?: (enabled: boolean) => void
}

export default function MeetingBotToggle({
  meetingId,
  initialEnabled,
  onToggle,
}: MeetingBotToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    const newValue = !enabled
    setIsLoading(true)
    setError(null)

    // Optimistic update
    setEnabled(newValue)
    if (onToggle) {
      onToggle(newValue)
    }

    try {
      const response = await fetch(`/api/meetings/${meetingId}/bot-toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bot_enabled: newValue }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update bot setting')
      }

      const { meeting } = await response.json()
      setEnabled(meeting.bot_enabled ?? true)
    } catch (err) {
      // Revert optimistic update on error
      setEnabled(enabled)
      setError(err instanceof Error ? err.message : 'Failed to update')
      console.error('Error toggling bot:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          disabled={isLoading}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
        />
        <span className="text-sm text-gray-700">
          {enabled ? 'Bot Enabled' : 'Bot Disabled'}
        </span>
      </label>
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

