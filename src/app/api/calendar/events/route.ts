import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Authenticate user and retrieve provider_token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!session.provider_token) {
    return NextResponse.json({ error: 'Missing Google provider token. Please re-authenticate.' }, { status: 401 })
  }

  // Read start/end from query params
  const url = new URL(request.url)
  const timeMin = url.searchParams.get('start')
  const timeMax = url.searchParams.get('end')

  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: 'Missing required query parameters: start, end' }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    })

    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${session.provider_token}`,
      },
    })

    if (!resp.ok) {
      const msg = await resp.text()
      return NextResponse.json({ error: `Google Calendar API error: ${msg}` }, { status: resp.status })
    }

    const data = await resp.json()
    return NextResponse.json({ events: data?.items ?? [] }, { status: 200 })
  } catch (e) {
    const err = e as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


