import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Type for the selected meeting fields from the query
type MeetingSelect = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
  customer_id: string | null
  bot_enabled: boolean | null
}

// Type for the selected customer fields from the query
type CustomerSelect = {
  customer_id: string
  full_name: string | null
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'Start and end dates required' }, { status: 400 })
    }

    // Query meetings for current week
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select(`
        id,
        title,
        start_time,
        end_time,
        customer_id,
        bot_enabled
      `)
      .eq('user_id', user.id)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching meetings:', error)
      return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
    }

    // Fetch customer names separately
    const customerIds = [...new Set((meetings || []).map((m: MeetingSelect) => m.customer_id).filter((id): id is string => Boolean(id)))]
    const customerMap = new Map<string, string | null>()
    
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('customer_id, full_name')
        .in('customer_id', customerIds)
      
      if (customers) {
        customers.forEach((c: CustomerSelect) => {
          customerMap.set(c.customer_id, c.full_name)
        })
      }
    }

    // Transform the data to include customer name and bot_enabled
    const transformedMeetings = (meetings || []).map((meeting: MeetingSelect & { id: string; bot_enabled: boolean | null }) => ({
      id: meeting.id,
      title: meeting.title,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      customer_name: meeting.customer_id ? customerMap.get(meeting.customer_id) || null : null,
      bot_enabled: meeting.bot_enabled ?? true
    }))

    return NextResponse.json({ meetings: transformedMeetings })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
