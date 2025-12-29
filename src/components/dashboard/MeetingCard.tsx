'use client'

import { Calendar, Clock, Video } from 'lucide-react'
import { formatMeetingDateTime } from '@/lib/utils/meeting-utils'

interface MeetingCardProps {
  meeting: {
    id: string | number
    title: string | null
    start_time: string | null
    duration_minutes: number
    meeting_url: string | null
  }
}

export default function MeetingCard({ meeting }: MeetingCardProps) {
  const { date, time, duration } = formatMeetingDateTime(
    meeting.start_time,
    meeting.duration_minutes
  )

  const hasMeetingUrl = !!meeting.meeting_url

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Row 1: Header Strip */}
      <div className="bg-purple-50 py-2 px-4 flex items-center gap-4 text-sm font-semibold text-gray-700">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-purple-600" />
          <span>{date}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-purple-600" />
          <span>{time}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Video className="w-4 h-4 text-purple-600" />
          <span>{duration}</span>
        </div>
      </div>

      {/* Row 2: Body */}
      <div className="bg-white p-4">
        <h3 className="text-lg font-bold text-gray-900">
          {meeting.title || 'Untitled Meeting'}
        </h3>
      </div>

      {/* Row 3: Action Footer */}
      <div className="bg-white px-4 pb-4 flex items-center justify-between">
        {/* Left: Notes Button */}
        <button
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={() => {
            // Placeholder for notes functionality
            console.log('Notes clicked for meeting:', meeting.id)
          }}
        >
          Notes
        </button>

        {/* Right: Record Toggle + Join Button */}
        <div className="flex items-center gap-3">
          {/* Record Toggle (UI only, mocked) */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              onChange={() => {
                // Placeholder for recording toggle
                console.log('Recording toggled for meeting:', meeting.id)
              }}
            />
            <span>Record</span>
          </label>

          {/* Join Button */}
          {hasMeetingUrl ? (
            <a
              href={meeting.meeting_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-300 rounded px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Join
            </a>
          ) : (
            <button
              disabled
              className="border border-gray-200 rounded px-4 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

