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
      
      console.log(`\n🔍 Processing event: "${event.summary || 'Untitled'}"`)
      
      if (!event.attendees || event.attendees.length === 0) {
        console.log('❌ REJECTED: No attendees')
        continue
      }

      console.log(`👥 Attendees (${event.attendees.length}):`, event.attendees.map(a => `${a.email} (${a.responseStatus})`))

      // First, filter to get only actual guests who have accepted (not declined)
      const externalGuests = event.attendees.filter((attendee: Attendee) => {
        return attendee.email && 
               attendee.email !== userEmail && 
               attendee.responseStatus !== 'declined'
      })

      console.log(`🎯 External guests (after filtering): ${externalGuests.length}`, externalGuests.map(g => g.email))

      // Now, check if any of these remaining guests are from an external domain
      const hasExternalGuest = externalGuests.some((attendee: Attendee) => {
        const attendeeDomain = attendee.email.split('@')[1]
        const isExternal = attendeeDomain && attendeeDomain !== userDomain
        console.log(`  🔍 Domain check: ${attendee.email} (${attendeeDomain}) vs ${userDomain} = ${isExternal ? 'EXTERNAL' : 'INTERNAL'}`)
        return isExternal
      })

      if (hasExternalGuest) {
        console.log('✅ KEPT: Has external guests')
        
        // Transform to meeting data
        const startDate = event.start?.dateTime || event.start?.date
        const endDate = event.end?.dateTime || event.end?.date
        
        const attendees = event.attendees?.map(a => a.email).filter(Boolean) || []
        const externalAttendees = externalGuests.map(g => g.email).filter(Boolean)

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
        console.log('❌ REJECTED: No external guests')
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

    // TEMPORARILY COMMENTED OUT FOR DEBUGGING - Delete processed records from temp_meetings
    // const { error: deleteError } = await supabase
    //   .from('temp_meetings')
    //   .delete()
    //   .eq('user_id', userId)
    //   .eq('processed', false)

    // if (deleteError) {
    //   console.error('Database delete error:', deleteError)
    //   return new Response(
    //     JSON.stringify({ error: 'Failed to cleanup temp_meetings' }),
    //     { 
    //       status: 500, 
    //       headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    //     }
    //   )
    // }

    // console.log(`✅ Cleaned up ${tempMeetings.length} records from temp_meetings`)
    console.log(`🔍 DEBUG: Left ${tempMeetings.length} records in temp_meetings for inspection`)

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
