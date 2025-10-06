import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Type definition for Google Calendar API objects
type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  attendees?: Array<{
    email: string;
    responseStatus?: string;
  }>;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔍 LOG: Entry Point - Function invoked
    console.log('🚀 SYNC-CALENDAR: Function invoked successfully')

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the user from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('❌ CRITICAL ERROR: Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the JWT and get user info
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.log('❌ CRITICAL ERROR: Invalid or expired token', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 🔍 LOG: User verification successful
    console.log('✅ USER VERIFIED: User ID:', user.id, 'Email:', user.email)

    // Get the provider token from request body
    const requestBody = await req.json()
    const providerToken = requestBody.provider_token

    // 🔍 LOG: Provider token verification
    if (!providerToken) {
      console.log('❌ CRITICAL ERROR: No Google access token found in request body')
      return new Response(
        JSON.stringify({ error: 'No Google access token found in request body. Please re-authenticate.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    console.log('✅ PROVIDER TOKEN: Successfully received Google access token')

    // Calculate date range (next 3 months)
    const now = new Date()
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    const timeMin = now.toISOString()
    const timeMax = threeMonthsFromNow.toISOString()

    // Stage 1: fetch list of all calendars the user has access to
    const calendarListUrl = `https://www.googleapis.com/calendar/v3/users/me/calendarList`
    console.log('🌐 GOOGLE API CALL: Fetching calendar list:', calendarListUrl)
    const calendarListResp = await fetch(calendarListUrl, {
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
    })
    console.log('📡 CALENDAR LIST RESPONSE:', calendarListResp.status, calendarListResp.statusText)
    if (!calendarListResp.ok) {
      const errorText = await calendarListResp.text()
      console.error('❌ GOOGLE CALENDAR LIST ERROR (raw body):', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar list from Google' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    type CalendarListEntry = { id: string; summary?: string }
    const calendarListData: { items?: CalendarListEntry[] } = await calendarListResp.json()
    const calendars: CalendarListEntry[] = calendarListData.items || []
    console.log('📚 CALENDARS FOUND:', calendars.length)

    // Stage 2: iterate calendars and fetch events per calendar
    const allEvents: GoogleCalendarEvent[] = []
    for (const cal of calendars) {
      const calId = encodeURIComponent(cal.id)
      const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500`
      console.log('🌐 GOOGLE API CALL: Fetching events for calendar:', cal.id, 'URL:', eventsUrl)
      const eventsResp = await fetch(eventsUrl, {
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
        },
      })
      console.log('📡 EVENTS RESPONSE:', eventsResp.status, eventsResp.statusText, 'for calendar:', cal.id)
      if (!eventsResp.ok) {
        const errText = await eventsResp.text()
        console.error('❌ EVENTS ERROR (raw body) for calendar', cal.id, ':', errText)
        // Continue to next calendar instead of failing whole sync
        continue
      }
      const data: { items?: GoogleCalendarEvent[]; nextPageToken?: string } = await eventsResp.json()
      const batch = data.items || []
      console.log(`📦 BATCH SIZE [${cal.id}]:`, batch.length)
      console.log('🔁 Pagination token (nextPageToken):', data.nextPageToken || 'No, this is the last page.')
      allEvents.push(...batch)
    }

    // 🔍 LOG: Raw data from Google across all calendars
    console.log(`📊 GOOGLE DATA (ALL CALENDARS): Total raw events fetched: ${allEvents.length}`)
    if (allEvents.length > 0) {
      console.log('📋 SAMPLE EVENT:', JSON.stringify(allEvents[0], null, 2))
    }
    for (const ev of allEvents) {
      console.log('📝 EVENT TITLE:', ev.summary || 'Untitled')
    }

    // Insert all raw events into temp_meetings table
    if (allEvents.length > 0) {
      // Conform strictly to schema: only user_id and google_event_data
      const tempMeetings: Array<{ user_id: string; google_event_data: GoogleCalendarEvent }> = allEvents.map(
        (event: GoogleCalendarEvent) => ({
          user_id: user.id,
          google_event_data: event,
        })
      )

      // 🔍 LOG: Database insertion attempt
      console.log('💾 DATABASE INSERT: About to insert', tempMeetings.length, 'events into temp_meetings table')
      console.log('📦 INSERT PAYLOAD (temp_meetings):', JSON.stringify(tempMeetings, null, 2))

      const { error: insertError } = await supabase
        .from('temp_meetings')
        .insert(tempMeetings)

      console.log('🧪 INSERT RESULT (temp_meetings) error:', insertError)
      if (insertError) {
        console.error('❌ DATABASE ERROR: Insert failed:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to save raw events to database' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('✅ DATABASE SUCCESS: Inserted', allEvents.length, 'raw events into temp_meetings table')

      // Invoke the process-meetings function to start the next stage
      console.log('🔄 PIPELINE: About to invoke process-meetings function')
      const { error: processError } = await supabase.functions.invoke('process-meetings', {
        body: {
          user_id: user.id
        }
      })

      if (processError) {
        console.error('❌ PIPELINE ERROR: Process meetings invocation failed:', processError)
        return new Response(
          JSON.stringify({ error: 'Failed to start processing pipeline' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('✅ PIPELINE SUCCESS: Successfully invoked process-meetings function')
    } else {
      console.log('⚠️ NO EVENTS: No events found from Google Calendar API')
    }

    return new Response(
      JSON.stringify({ 
        message: 'Raw sync completed', 
        syncedEvents: allEvents.length 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Sync calendar error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})