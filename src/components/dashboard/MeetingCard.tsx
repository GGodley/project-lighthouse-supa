'use client'

import { useState } from 'react'
import { Calendar, Clock, Video, ExternalLink } from 'lucide-react'
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
  const [isRecording, setIsRecording] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Row 1: Header Strip */}
      <div className="bg-purple-50 py-2 px-3 flex items-center gap-4 text-sm font-semibold text-gray-700">
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
      <div className="bg-white px-3 py-3">
        <h3 className="text-lg font-bold text-gray-900">
          {meeting.title || 'Untitled Meeting'}
        </h3>
      </div>

      {/* Row 3: Action Footer */}
      <div className="bg-white px-3 pb-3 flex items-center justify-between">
        {/* Left: Notes Button */}
        <button
          className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={() => {
            // Placeholder for notes functionality
            console.log('Notes clicked for meeting:', meeting.id)
          }}
        >
          Notes
        </button>

        {/* Right: Record Toggle + Join Button */}
        <div className="flex items-center gap-3">
          {/* Record Toggle Button - Custom Pill Toggle */}
          <button
            onClick={() => {
              setIsRecording(!isRecording)
              console.log('Recording toggled for meeting:', meeting.id, !isRecording)
            }}
            className={`rounded-full border px-3 py-1 flex items-center gap-2 cursor-pointer text-sm font-medium transition-colors ${
              isRecording
                ? 'border-red-500 text-red-600 bg-red-50'
                : 'border-gray-300 text-gray-600 bg-white'
            }`}
          >
            {isRecording && (
              <div className="w-2 h-2 rounded-full bg-red-600"></div>
            )}
            <span>Record</span>
          </button>

          {/* Join Button */}
          {hasMeetingUrl ? (
            <a
              href={meeting.meeting_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-gray-300 rounded px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <span>Join</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              disabled
              className="bg-white border border-gray-200 rounded px-4 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed flex items-center gap-1.5"
            >
              <span>Join</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

