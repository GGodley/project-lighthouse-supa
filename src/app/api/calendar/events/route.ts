//
// ⚠️ PROMPT FOR CURSOR: Replace the content of src/app/api/calendar/events/route.ts ⚠️
//
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // 1. Get the user's session and, crucially, their email address
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user.email) {
      return NextResponse.json({ error: 'Not authenticated or user email is missing' }, { status: 401 });
    }
    if (!session.provider_token) {
      return NextResponse.json({ error: 'Missing Google provider token. Please re-authenticate.' }, { status: 400 });
    }

    // ✅ NEW LOGIC: Determine the user's own domain
    const userDomain = session.user.email.split('@')[1];
    if (!userDomain) {
        return NextResponse.json({ error: 'Could not determine user domain from email.' }, { status: 400 });
    }

    // 2. Set the time range for the API call
    const timeMin = new Date().toISOString(); // From now...
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 3); // ...to 3 months in the future

    // 3. Build the URL for the Google Calendar API
    const calendarApiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    calendarApiUrl.searchParams.append('timeMin', timeMin);
    calendarApiUrl.searchParams.append('timeMax', timeMax.toISOString());
    calendarApiUrl.searchParams.append('singleEvents', 'true'); // Expands recurring events
    calendarApiUrl.searchParams.append('orderBy', 'startTime'); // Sorts the events chronologically

    // 4. Fetch ALL events from Google in that time range
    const response = await fetch(calendarApiUrl.toString(), {
      headers: {
        Authorization: `Bearer ${session.provider_token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ error: 'Failed to fetch from Google Calendar API', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    const allEvents = data.items || [];

    // 5. ✅ NEW LOGIC: Filter the events on our server
    const externalEvents = allEvents.filter((event: any) => {
      if (!event.attendees || event.attendees.length === 0) {
        return false; // Skip events with no attendees
      }
      
      // The `some` method checks if AT LEAST ONE attendee meets the condition
      return event.attendees.some((attendee: any) => {
        if (!attendee.email) return false; // Skip attendees without an email (e.g., rooms)
        
        // An external attendee's email domain is different from the user's
        const attendeeDomain = attendee.email.split('@')[1];
        return attendeeDomain && attendeeDomain !== userDomain;
      });
    });

    // 6. Return only the filtered, external-facing events
    return NextResponse.json({ items: externalEvents });

  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
  }
}
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
    // Return the Google Calendar events array directly (no nesting)
    return NextResponse.json(data?.items ?? [], { status: 200 })
  } catch (e) {
    const err = e as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


