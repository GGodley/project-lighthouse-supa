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
  hangout_link?: string | null
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

      // Step 2: Build actual guests list (exclude user and declined)
      const actualGuests: Attendee[] = event.attendees.filter((a: Attendee) => {
        if (!a.email) return false
        const isUser = a.email.toLowerCase() === userEmail.toLowerCase()
        const isDeclined = a.responseStatus === 'declined'
        return !isUser && !isDeclined
      })
      console.log('🧪 INTERMEDIATE actualGuests (not user, not declined):', actualGuests.map(g => `${g.email} (${g.responseStatus})`))

      // Step 3: Determine if any actual guest is external (different domain)
      const hasExternalGuest = actualGuests.some((attendee: Attendee) => {
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
        const externalAttendees = actualGuests
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
          hangout_link: event.hangoutLink || null,
        })
      } else {
        console.log(`[INFO] Discarding event '${title}' because no external guests were found.`)
      }
    }

    console.log(`\n📊 Filtering complete: ${filteredEvents.length} events passed the filter out of ${tempMeetings.length} total`)

    // Upsert filtered events into the final meetings table with correct column mapping
    if (filteredEvents.length > 0) {
      const meetingsToUpsert = filteredEvents.map((e) => ({
        user_id: e.user_id,
        google_event_id: e.google_event_id,
        title: e.title, // from Google event summary
        start_time: e.meeting_date, // from event.start.dateTime or event.start.date
        end_time: e.end_date, // from event.end.dateTime or event.end.date
        hangout_link: e.hangout_link ?? null,
      }))

      console.log('📦 UPSERT PAYLOAD (meetings):', JSON.stringify(meetingsToUpsert, null, 2))
      const { error: upsertError } = await supabase
        .from('meetings')
        .upsert(meetingsToUpsert, {
          onConflict: 'google_event_id,user_id'
        })
      console.log('🧪 UPSERT RESULT (meetings) error:', upsertError)

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
