'use client'

import { useState } from 'react'
import DashboardMeetingsListWithCards from '@/components/dashboard/DashboardMeetingsListWithCards'

export default function MeetingsWidget() {
  const [meetingFilter, setMeetingFilter] = useState<'upcoming' | 'past'>('upcoming')

  return (
    <div className="lg:col-span-2 border border-gray-200 rounded-xl bg-white flex flex-col h-[500px]">
      {/* Header with Tabs */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/30 flex justify-between items-center shrink-0">
        <h3 className="font-semibold text-gray-900">Meetings</h3>
        
        {/* Toggle Pills */}
        <div className="flex p-1 bg-gray-200/50 rounded-lg">
          <button
            onClick={() => setMeetingFilter('upcoming')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              meetingFilter === 'upcoming' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setMeetingFilter('past')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              meetingFilter === 'past' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Past
          </button>
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        <DashboardMeetingsListWithCards filter={meetingFilter} />
      </div>
    </div>
  )
}

