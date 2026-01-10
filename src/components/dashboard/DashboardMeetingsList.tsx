'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { UpcomingMeetingCard } from '@/components/ui/UpcomingMeetingCard'
import Link from 'next/link'

interface Meeting {
  id: number
  title: string | null
  start_time: string | null
  meeting_url: string | null
  company_id: string | null
}

export default function DashboardMeetingsList() {
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

        const { data, error } = await supabase
          .from('meetings')
          .select('id, title, start_time, meeting_url, company_id')
          .eq('user_id', user.id)
          .gte('start_time', today.toISOString())
          .lt('start_time', nextWeek.toISOString())
          .order('start_time', { ascending: true })
          .limit(5)

        if (error) throw error
        setMeetings(data || [])
      } catch (err) {
        console.error('Error fetching meetings:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [supabase])

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "Date TBD";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "Date TBD";
    }
  };

  const getPlatform = (url: string | null): string => {
    if (!url) return "Google Meet";
    const urlLower = url.toLowerCase();
    if (urlLower.includes("zoom")) return "Zoom";
    if (urlLower.includes("teams") || urlLower.includes("microsoft")) return "Microsoft Teams";
    if (urlLower.includes("meet") || urlLower.includes("google")) return "Google Meet";
    return "Video Call";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading meetings...</p>
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No upcoming meetings scheduled
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const meetingLink = meeting.company_id 
          ? `/dashboard/customer-threads/${meeting.company_id}`
          : '#';
        
        return (
          <Link key={meeting.id} href={meetingLink} className="block">
            <div className="hover:opacity-80 transition-opacity">
              <UpcomingMeetingCard
                title={meeting.title || "Untitled Meeting"}
                date={formatDate(meeting.start_time)}
                platform={getPlatform(meeting.meeting_url)}
              />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

