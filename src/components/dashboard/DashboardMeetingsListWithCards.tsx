'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { MeetingCard } from '@/components/dashboard/MeetingCard'

interface Meeting {
  id: number
  title: string | null
  start_time: string | null
  meeting_url: string | null
  company_id: string | null
  bot_enabled: boolean | null
}

// Type for meeting data returned from Supabase (includes bot_enabled which may not be in generated types)
type MeetingRow = {
  id: number
  title: string | null
  start_time: string | null
  meeting_url: string | null
  company_id: string | null
  bot_enabled?: boolean | null
}

export default function DashboardMeetingsListWithCards() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const nextWeek = new Date(today)
        nextWeek.setDate(nextWeek.getDate() + 7)

        // Fetch meetings with bot_enabled
        // Cast query result to handle bot_enabled column that exists in DB but may not be in generated types
        const queryResult = await supabase
          .from('meetings')
          .select('id, title, start_time, meeting_url, company_id, bot_enabled')
          .eq('user_id', user.id)
          .gte('start_time', today.toISOString())
          .lt('start_time', nextWeek.toISOString())
          .order('start_time', { ascending: true })
          .limit(10)

        if (queryResult.error) throw queryResult.error
        
        // Cast data to MeetingRow[] to handle bot_enabled column
        const rawData = queryResult.data as MeetingRow[] | null
        
        // Map data to Meeting type
        const meetingsWithBotEnabled: Meeting[] = (rawData || []).map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          start_time: meeting.start_time,
          meeting_url: meeting.meeting_url,
          company_id: meeting.company_id,
          bot_enabled: meeting.bot_enabled ?? true // Default to true if null/undefined
        }))
        
        setMeetings(meetingsWithBotEnabled)
      } catch (err) {
        console.error('Error fetching meetings:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [supabase])

  const getPlatform = (url: string | null): string => {
    if (!url) return "Google Meet";
    const urlLower = url.toLowerCase();
    if (urlLower.includes("zoom")) return "Zoom";
    if (urlLower.includes("teams") || urlLower.includes("microsoft")) return "Microsoft Teams";
    if (urlLower.includes("meet") || urlLower.includes("google")) return "Google Meet";
    return "Video Call";
  };

  const handleRecordToggle = async (meetingId: number, newStatus: boolean) => {
    try {
      // Update bot_enabled in database
      // Use type assertion for update payload since bot_enabled may not be in generated types
      const updatePayload: { bot_enabled: boolean } = { bot_enabled: newStatus }
      const { error } = await supabase
        .from('meetings')
        .update(updatePayload as Record<string, unknown>)
        .eq('id', meetingId)

      if (error) throw error

      // Optimistic update
      setMeetings(prevMeetings =>
        prevMeetings.map(meeting =>
          meeting.id === meetingId
            ? { ...meeting, bot_enabled: newStatus }
            : meeting
        )
      )
    } catch (err) {
      console.error('Error updating recording status:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading meetings...</p>
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-gray-400">
        No meetings scheduled for today or tomorrow.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          id={meeting.id.toString()}
          title={meeting.title || "Untitled Meeting"}
          startTime={meeting.start_time || new Date().toISOString()}
          platform={getPlatform(meeting.meeting_url)}
          isRecording={meeting.bot_enabled ?? true}
          onRecordToggle={(newStatus) => handleRecordToggle(meeting.id, newStatus)}
        />
      ))}
    </div>
  )
}

