import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleCalendarEvent {
  id: string
  summary: string
  start: {
    dateTime?: string
    date?: string
  }
  end: {
    dateTime?: string
    date?: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: string
  }>
  location?: string
  description?: string
}

interface MeetingData {
  google_event_id: string
  user_id: string
  title: string
  meeting_date: string
  end_date: string
  location?: string
  description?: string
  attendees: string[]
  external_attendees: string[]
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the user from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
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
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the provider token from request body
    const requestBody = await req.json()
    const providerToken = requestBody.provider_token
    const userEmail = user.email

    if (!providerToken) {
      return new Response(
        JSON.stringify({ error: 'No Google access token found in request body. Please re-authenticate.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate date range (next 3 months)
    const now = new Date()
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    const timeMin = now.toISOString()
    const timeMax = threeMonthsFromNow.toISOString()

    // Fetch calendar events from Google Calendar API
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500`
    
    const calendarResponse = await fetch(calendarUrl, {
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text()
      console.error('Google Calendar API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar events from Google' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const calendarData = await calendarResponse.json()
    const events: GoogleCalendarEvent[] = calendarData.items || []

    // Filter events to only include those with external attendees
    const filteredEvents = events.filter(event => {
      if (!event.attendees || event.attendees.length === 0) {
        return false
      }

      // Check if there's at least one external attendee
      const hasExternalAttendee = event.attendees.some(attendee => {
        const attendeeEmail = attendee.email?.toLowerCase()
        const userEmailLower = userEmail?.toLowerCase()
        
        // Skip the user themselves
        if (attendeeEmail === userEmailLower) {
          return false
        }
        
        // Check if attendee is external (different domain)
        if (userEmailLower && attendeeEmail) {
          const userDomain = userEmailLower.split('@')[1]
          const attendeeDomain = attendeeEmail.split('@')[1]
          return userDomain !== attendeeDomain
        }
        
        return false
      })

      return hasExternalAttendee
    })

    // Transform events to meeting data
    const meetings: MeetingData[] = filteredEvents.map(event => {
      const startDate = event.start.dateTime || event.start.date
      const endDate = event.end.dateTime || event.end.date
      
      const attendees = event.attendees?.map(a => a.email).filter(Boolean) || []
      const externalAttendees = event.attendees?.filter(attendee => {
        const attendeeEmail = attendee.email?.toLowerCase()
        const userEmailLower = userEmail?.toLowerCase()
        
        if (attendeeEmail === userEmailLower) return false
        
        if (userEmailLower && attendeeEmail) {
          const userDomain = userEmailLower.split('@')[1]
          const attendeeDomain = attendeeEmail.split('@')[1]
          return userDomain !== attendeeDomain
        }
        
        return false
      }).map(a => a.email).filter(Boolean) || []

      return {
        google_event_id: event.id,
        user_id: user.id,
        title: event.summary || 'Untitled Meeting',
        meeting_date: startDate,
        end_date: endDate,
        location: event.location,
        description: event.description,
        attendees,
        external_attendees: externalAttendees,
      }
    })

    // Upsert meetings into the database
    if (meetings.length > 0) {
      const { error: upsertError } = await supabase
        .from('meetings')
        .upsert(meetings, {
          onConflict: 'google_event_id,user_id'
        })

      if (upsertError) {
        console.error('Database upsert error:', upsertError)
        return new Response(
          JSON.stringify({ error: 'Failed to save meetings to database' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Sync completed', 
        syncedEvents: meetings.length 
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