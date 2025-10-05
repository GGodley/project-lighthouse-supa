//
// ⚠️ THIS IS THE DIAGNOSTIC VERSION of /api/calendar/events/route.ts ⚠️
//
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  console.log("--- [API /calendar/events] Request received ---");

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // --- DIAGNOSTIC LOG 1: Check the session ---
    console.log("[API] Attempting to get session...");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error("[API] Error getting session:", sessionError.message);
    }
    console.log("[API] Session object found:", !!session);
    
    if (!session || !session.user.email) {
      console.error("[API] CRITICAL: Not authenticated or user email is missing. Returning 401.");
      return NextResponse.json({ error: 'Not authenticated or user email is missing' }, { status: 401 });
    }
    
    // --- DIAGNOSTIC LOG 2: Check for the provider token ---
    console.log("[API] Provider token exists:", !!session.provider_token);
    if (!session.provider_token) {
        console.error("[API] CRITICAL: Missing Google provider token. Returning 400.");
        return NextResponse.json({ error: 'Missing Google provider token. Please re-authenticate.' }, { status: 400 });
    }
    
    console.log("[API] Authentication successful. Proceeding to fetch from Google...");
    
    // ... (The rest of your Google Calendar fetching logic remains the same) ...
    const userDomain = session.user.email.split('@')[1];
    const timeMin = request.nextUrl.searchParams.get('start') || new Date().toISOString();
    const timeMaxDate = new Date();
    timeMaxDate.setMonth(timeMaxDate.getMonth() + 3);
    const timeMax = request.nextUrl.searchParams.get('end') || timeMaxDate.toISOString();

    const calendarApiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    calendarApiUrl.searchParams.append('timeMin', timeMin);
    calendarApiUrl.searchParams.append('timeMax', timeMax);
    calendarApiUrl.searchParams.append('singleEvents', 'true');
    calendarApiUrl.searchParams.append('orderBy', 'startTime');

    const response = await fetch(calendarApiUrl.toString(), {
      headers: { Authorization: `Bearer ${session.provider_token}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[API] Google API Error:", errorData);
      return NextResponse.json({ error: 'Failed to fetch from Google Calendar API', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    // ... (Filtering logic remains the same) ...

    return NextResponse.json({ items: data.items });

  } catch (error) {
    const err = error as Error;
    console.error("[API] FATAL Uncaught Error:", err.message);
    return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
  }
}
//
// ⚠️ PROMPT FOR CURSOR: Replace the content of src/app/api/calendar/events/route.ts ⚠️
//
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
// no NextRequest import needed; we don't use the request param

type GoogleAttendee = { email?: string };
type GoogleEvent = { attendees?: GoogleAttendee[] };

export async function GET() {
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
    const externalEvents = (allEvents as GoogleEvent[]).filter((event) => {
      if (!event.attendees || event.attendees.length === 0) {
        return false; // Skip events with no attendees
      }
      
      // The `some` method checks if AT LEAST ONE attendee meets the condition
      return event.attendees.some((attendee) => {
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
// Duplicate block removed to fix "Identifier 'cookies' has already been declared" and duplicate GET


