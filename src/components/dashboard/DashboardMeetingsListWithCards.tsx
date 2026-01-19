'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { Video, Calendar, X } from 'lucide-react'

interface Meeting {
  meeting_uuid_id: string
  title: string | null
  start_time: string | null
  meeting_url: string | null
  company_id: string | null
  bot_enabled: boolean
  is_hidden: boolean
}

// Type for meeting data returned from Supabase
type MeetingRow = {
  meeting_uuid_id: string
  title: string | null
  start_time: string | null
  meeting_url: string | null
  company_id: string | null
  bot_enabled: boolean
  is_hidden: boolean
}

interface DashboardMeetingsListWithCardsProps {
  filter?: 'upcoming' | 'past'
}

export default function DashboardMeetingsListWithCards({ filter = 'upcoming' }: DashboardMeetingsListWithCardsProps) {
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()

  // Fetch all meetings once - filter is applied client-side, so it's intentionally not in deps
  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Fetch both upcoming and past meetings
        const queryResult = await supabase
          .from('meetings')
          .select('meeting_uuid_id, title, start_time, meeting_url, company_id, bot_enabled, is_hidden')
          .eq('user_id', user.id)
          .order('start_time', { ascending: false })
          .limit(50) // Fetch more to cover both upcoming and past

        if (queryResult.error) throw queryResult.error
        
        // Cast data to MeetingRow[]
        const rawData = queryResult.data as unknown as MeetingRow[] | null
        
        // Map data to Meeting type and filter out hidden meetings
        const meetingsWithBotEnabled: Meeting[] = (rawData || [])
          .filter((meeting) => !meeting.is_hidden) // Filter out hidden meetings
          .map((meeting) => ({
            meeting_uuid_id: meeting.meeting_uuid_id,
            title: meeting.title,
            start_time: meeting.start_time,
            meeting_url: meeting.meeting_url,
            company_id: meeting.company_id,
            bot_enabled: meeting.bot_enabled,
            is_hidden: meeting.is_hidden
          }))
        
        setAllMeetings(meetingsWithBotEnabled)
      } catch (err) {
        console.error('Error fetching meetings:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const getPlatform = (url: string | null): string => {
    if (!url) return "Google Meet";
    const urlLower = url.toLowerCase();
    if (urlLower.includes("zoom")) return "Zoom";
    if (urlLower.includes("teams") || urlLower.includes("microsoft")) return "Microsoft Teams";
    if (urlLower.includes("meet") || urlLower.includes("google")) return "Google Meet";
    return "Video Call";
  };

  // Filter meetings based on filter prop
  const now = new Date()
  const filteredMeetings = allMeetings.filter(meeting => {
    if (!meeting.start_time) return false
    const meetingDate = new Date(meeting.start_time)
    return filter === 'upcoming' 
      ? meetingDate >= now 
      : meetingDate < now
  })

  // Sort: upcoming ascending, past descending
  const sortedMeetings = [...filteredMeetings].sort((a, b) => {
    if (!a.start_time || !b.start_time) return 0
    const dateA = new Date(a.start_time).getTime()
    const dateB = new Date(b.start_time).getTime()
    return filter === 'upcoming' ? dateA - dateB : dateB - dateA
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading meetings...</p>
      </div>
    )
  }

  if (sortedMeetings.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
        <Calendar className="w-8 h-8 mb-2 opacity-20" />
        <span className="text-sm">No {filter} meetings found</span>
      </div>
    )
  }

  return (
    <>
      {sortedMeetings.map((meeting, index) => (
        <MeetingListItem
          key={meeting.meeting_uuid_id} // Use UUID for key
          id={meeting.meeting_uuid_id}  // Pass UUID as id
          title={meeting.title || "Untitled"}
          startTime={meeting.start_time || new Date().toISOString()}
          platform={getPlatform(meeting.meeting_url)}
          isRecording={meeting.bot_enabled} // Map DB field to prop
          onRecordToggle={async (status) => {
            try {
              const { data, error } = await supabase.functions.invoke('manage-meeting', {
                body: { action: 'toggle_record', meetingId: meeting.meeting_uuid_id, shouldRecord: status }
              });
              if (error) throw error;
              if (!data?.success) throw new Error(data?.message || 'Failed to toggle recording');
              // Optimistically update local state
              setAllMeetings(prevMeetings =>
                prevMeetings.map(m =>
                  m.meeting_uuid_id === meeting.meeting_uuid_id
                    ? { ...m, bot_enabled: status }
                    : m
                )
              );
            } catch (err) {
              console.error('Error updating recording status:', err);
            }
          }}
          onHide={async () => {
            try {
              const { data, error } = await supabase.functions.invoke('manage-meeting', {
                body: { action: 'hide', meetingId: meeting.meeting_uuid_id }
              });
              if (error) throw error;
              if (!data?.success) throw new Error(data?.message || 'Failed to hide meeting');
              // Optimistically remove from list
              setAllMeetings(prevMeetings =>
                prevMeetings.filter(m => m.meeting_uuid_id !== meeting.meeting_uuid_id)
              );
            } catch (err) {
              console.error('Error hiding meeting:', err);
            }
          }}
          isLast={index === sortedMeetings.length - 1}
        />
      ))}
    </>
  )
}

// Interface for MeetingListItem props
interface MeetingListItemProps {
  id: string; // This will hold the UUID
  title: string;
  startTime: string;
  platform?: string;
  isRecording: boolean; // Maps to 'bot_enabled'
  onRecordToggle: (newStatus: boolean) => Promise<void>;
  onHide: () => Promise<void>; // New prop for hiding
  isLast?: boolean;
}

// Simple list item component for meetings
function MeetingListItem({ id, title, startTime, platform = 'google_meet', isRecording, onRecordToggle, onHide, isLast }: MeetingListItemProps) {
  const dateObj = new Date(startTime);
  const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = dateObj.getDate();
  const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isPast = dateObj < new Date();

  return (
    <div className={`p-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors relative ${!isLast ? 'border-b border-gray-100' : ''}`}>
      {/* Hide Button - Top Right */}
      <button
        onClick={() => onHide()}
        className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
        aria-label="Hide meeting"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Date Badge */}
      <div className={`shrink-0 w-16 h-16 rounded-lg border flex flex-col items-center justify-center ${
        isPast 
          ? 'bg-gray-50 border-gray-200' 
          : 'bg-blue-50 border-blue-100'
      }`}>
        <span className={`text-[10px] font-bold tracking-wider uppercase ${
          isPast ? 'text-gray-400' : 'text-blue-500'
        }`}>{month}</span>
        <span className={`text-2xl font-bold leading-none mt-0.5 ${
          isPast ? 'text-gray-500' : 'text-blue-700'
        }`}>{day}</span>
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0 ml-5 mr-4">
        <h4 className={`text-base font-bold truncate mb-1 ${isPast ? 'text-gray-500' : 'text-gray-900'}`} title={title}>
          {title}
        </h4>
        <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${
            isPast ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-600'
          }`}>
            <Video className="w-3 h-3" />
            {platform}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {time}
          </span>
        </div>
      </div>

      {/* Record Toggle - Only show for upcoming meetings */}
      {!isPast && (
        <div className="flex flex-col items-center gap-2 pl-4 border-l border-gray-100 ml-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Record</span>
          <button
            onClick={() => onRecordToggle(!isRecording)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isRecording ? 'bg-green-500' : 'bg-gray-200'
            }`}
            aria-label={isRecording ? 'Disable recording' : 'Enable recording'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isRecording ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}
      {isPast && (
        <div className="pl-4 border-l border-gray-100 ml-4">
          <span className="text-xs text-gray-400">Past</span>
        </div>
      )}
    </div>
  )
}

