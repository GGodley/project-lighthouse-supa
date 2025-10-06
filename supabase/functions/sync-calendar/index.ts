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

    // Fetch calendar events from Google Calendar API
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500`
    
    // 🔍 LOG: External API call
    console.log('🌐 GOOGLE API CALL: Fetching from URL:', calendarUrl)
    
    const calendarResponse = await fetch(calendarUrl, {
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
    })

    // 🔍 LOG: API response status
    console.log('📡 GOOGLE API RESPONSE: Status code:', calendarResponse.status)

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text()
      console.error('❌ GOOGLE API ERROR:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar events from Google' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const calendarData = await calendarResponse.json()
    const events = calendarData.items || []

    // 🔍 LOG: Raw data from Google (MOST CRITICAL)
    console.log('📊 GOOGLE DATA: Successfully fetched', events.length, 'raw events from Google')
    if (events.length > 0) {
      console.log('📋 GOOGLE DATA: First event sample:', JSON.stringify(events[0], null, 2))
    }

    // Insert all raw events into temp_meetings table
    if (events.length > 0) {
      const tempMeetings = events.map((event: GoogleCalendarEvent) => ({
        user_id: user.id,
        google_event_id: event.id,
        google_event_data: event,
        created_at: new Date().toISOString()
      }))

      // 🔍 LOG: Database insertion attempt
      console.log('💾 DATABASE INSERT: About to insert', tempMeetings.length, 'events into temp_meetings table')

      const { error: insertError } = await supabase
        .from('temp_meetings')
        .insert(tempMeetings)

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

      console.log('✅ DATABASE SUCCESS: Inserted', events.length, 'raw events into temp_meetings table')

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
        syncedEvents: events.length 
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