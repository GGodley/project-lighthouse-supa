import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Type definitions for Google Calendar API objects
type Attendee = {
  email: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  attendees?: Attendee[];
};

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

    // Get the user from the request body
    const requestBody = await req.json()
    const userId = requestBody.user_id

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get user's email to extract domain
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const userEmail = user.user.email!
    const userDomain = userEmail.split('@')[1]
    console.log('🔍 Processing meetings for user:', userEmail)
    console.log('🔍 User domain:', userDomain)

    // Query temp_meetings for unprocessed records
    const { data: tempMeetings, error: queryError } = await supabase
      .from('temp_meetings')
      .select('*')
      .eq('user_id', userId)
      .eq('processed', false)

    if (queryError) {
      console.error('Database query error:', queryError)
      return new Response(
        JSON.stringify({ error: 'Failed to query temp_meetings' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`📊 Found ${tempMeetings.length} unprocessed events`)

    if (tempMeetings.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No unprocessed meetings found', 
          processedCount: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Filter events that have external attendees
    const filteredEvents: MeetingData[] = []

    for (const tempMeeting of tempMeetings) {
      const event: GoogleCalendarEvent = tempMeeting.google_event_data
      const title = event.summary || 'Untitled'

      // Announce the job
      console.log(`\n🎬 PROCESSING EVENT: "${title}"`)

      // Show the inputs
      console.log('📥 INPUT userDomain:', userDomain)
      console.log('📥 INPUT raw attendees:', JSON.stringify(event.attendees || [], null, 2))

      if (!event.attendees || event.attendees.length === 0) {
        console.log('❌ REJECTED: No attendees')
        continue
      }

      console.log(`👥 Attendees (${event.attendees.length}):`, event.attendees.map(a => `${a.email} (${a.responseStatus})`))

      // Intermediate step: remove user and declined guests (diagnostic only)
      const externalGuestsByStatus: Attendee[] = event.attendees.filter((a: Attendee) => {
        if (!a.email) return false
        const isUser = a.email === userEmail
        const isDeclined = a.responseStatus === 'declined'
        return !isUser && !isDeclined
      })
      console.log('🧪 INTERMEDIATE externalGuests (not user, not declined):', externalGuestsByStatus.map(g => `${g.email} (${g.responseStatus})`))

      // New rule: responseStatus does not matter; keep event if any attendee has external domain
      const hasExternalGuest = event.attendees.some((attendee: Attendee) => {
        if (!attendee.email) return false
        const attendeeDomain = attendee.email.split('@')[1]
        const isExternal = Boolean(attendeeDomain) && attendeeDomain !== userDomain
        console.log(`  🔍 Domain check: ${attendee.email} (${attendeeDomain}) vs ${userDomain} = ${isExternal ? 'EXTERNAL' : 'INTERNAL'}`)
        return isExternal
      })

      if (hasExternalGuest) {
        console.log(`✅ KEPT: External guest detected for "${title}"`)
        
        // Transform to meeting data
        const startDate = event.start?.dateTime || event.start?.date
        const endDate = event.end?.dateTime || event.end?.date
        
        const attendees = event.attendees?.map(a => a.email).filter(Boolean) || []
        const externalAttendees = event.attendees
          .filter(a => !!a.email && a.email.split('@')[1] !== userDomain)
          .map(a => a.email)

        filteredEvents.push({
          google_event_id: event.id,
          user_id: userId,
          title: event.summary || 'Untitled Meeting',
          meeting_date: startDate || new Date().toISOString(),
          end_date: endDate || new Date().toISOString(),
          location: event.location,
          description: event.description,
          attendees,
          external_attendees: externalAttendees,
        })
      } else {
        console.log(`❌ DISCARDED: No external guests for "${title}"`)
      }
    }

    console.log(`\n📊 Filtering complete: ${filteredEvents.length} events passed the filter out of ${tempMeetings.length} total`)

    // Upsert filtered events into the final meetings table
    if (filteredEvents.length > 0) {
      const { error: upsertError } = await supabase
        .from('meetings')
        .upsert(filteredEvents, {
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

      console.log(`✅ Upserted ${filteredEvents.length} meetings into final table`)
    }

    // Mark the processed temp_meetings rows as processed = true
    const { error: markError } = await supabase
      .from('temp_meetings')
      .update({ processed: true })
      .eq('user_id', userId)
      .eq('processed', false)

    if (markError) {
      console.error('Database mark-as-processed error:', markError)
      return new Response(
        JSON.stringify({ error: 'Failed to mark temp_meetings as processed' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`✅ Marked ${tempMeetings.length} temp_meetings records as processed`)

    return new Response(
      JSON.stringify({ 
        message: 'Processing completed', 
        processedCount: filteredEvents.length 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Process meetings error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
