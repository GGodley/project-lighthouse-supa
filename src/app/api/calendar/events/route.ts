import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

type GoogleAttendee = { email?: string }
type GoogleEvent = { attendees?: GoogleAttendee[] }

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session || !session.user.email) {
      return NextResponse.json({ error: 'Not authenticated or user email is missing' }, { status: 401 })
    }
    if (!session.provider_token) {
      return NextResponse.json({ error: 'Missing Google provider token. Please re-authenticate.' }, { status: 400 })
    }

    const userDomain = session.user.email.split('@')[1]
    const timeMin = request.nextUrl.searchParams.get('start') || new Date().toISOString()
    const timeMaxDate = new Date()
    timeMaxDate.setMonth(timeMaxDate.getMonth() + 3)
    const timeMax = request.nextUrl.searchParams.get('end') || timeMaxDate.toISOString()

    const calendarApiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    calendarApiUrl.searchParams.append('timeMin', timeMin)
    calendarApiUrl.searchParams.append('timeMax', timeMax)
    calendarApiUrl.searchParams.append('singleEvents', 'true')
    calendarApiUrl.searchParams.append('orderBy', 'startTime')

    const response = await fetch(calendarApiUrl.toString(), {
      headers: { Authorization: `Bearer ${session.provider_token}` },
    })
    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.json({ error: 'Failed to fetch from Google Calendar API', details: errorData }, { status: response.status })
    }

    const data: { items?: unknown[] } = await response.json()
    const allEvents = (data.items ?? []) as GoogleEvent[]
    const externalEvents = allEvents.filter((event) => {
      if (!event.attendees || event.attendees.length === 0) return false
      return event.attendees.some((attendee) => {
        if (!attendee.email) return false
        const attendeeDomain = attendee.email.split('@')[1]
        return attendeeDomain && attendeeDomain !== userDomain
      })
    })

    return NextResponse.json({ items: externalEvents })
  } catch (e) {
    const err = e as Error
    return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 })
  }
}
//
// ⚠️ PROMPT FOR CURSOR: Replace the content of src/app/api/calendar/events/route.ts ⚠️
//
// Removed legacy duplicate block


