import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
        title,
        start_time,
        end_time,
        customer_id
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
    const customerIds = [...new Set((meetings || []).map((m: any) => m.customer_id).filter(Boolean))]
    const customerMap = new Map<string, string | null>()
    
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('customer_id, full_name')
        .in('customer_id', customerIds)
      
      if (customers) {
        customers.forEach(c => {
          customerMap.set(c.customer_id, c.full_name)
        })
      }
    }

    // Transform the data to include customer name
    const transformedMeetings = (meetings || []).map((meeting: any) => ({
      title: meeting.title,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      customer_name: meeting.customer_id ? customerMap.get(meeting.customer_id) || null : null
    }))

    return NextResponse.json({ meetings: transformedMeetings })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
