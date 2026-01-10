import React from 'react';
import { Video, Calendar } from 'lucide-react';

interface MeetingCardProps {
  id: string;
  title: string;
  startTime: string; // ISO String
  platform?: 'google_meet' | 'zoom' | 'teams' | string;
  isRecording: boolean;
  onRecordToggle: (newStatus: boolean) => void;
}

export function MeetingCard({ id, title, startTime, platform = 'google_meet', isRecording, onRecordToggle }: MeetingCardProps) {
  const dateObj = new Date(startTime);
  const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = dateObj.getDate();
  const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
      
      {/* 1. Date Badge */}
      <div className="shrink-0 w-16 h-16 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center justify-center">
        <span className="text-[10px] font-bold text-blue-500 tracking-wider uppercase">{month}</span>
        <span className="text-2xl font-bold text-blue-700 leading-none mt-0.5">{day}</span>
      </div>

      {/* 2. Main Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-base font-bold text-gray-900 truncate mb-1" title={title}>
          {title}
        </h4>
        <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
          <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded text-gray-600">
            <Video className="w-3 h-3" />
            {platform}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {time}
          </span>
        </div>
      </div>

      {/* 3. Record Toggle */}
      <div className="flex flex-col items-center gap-2 pl-4 border-l border-gray-100">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Record</span>
        <button
          onClick={() => onRecordToggle(!isRecording)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isRecording ? 'bg-green-500' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isRecording ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
