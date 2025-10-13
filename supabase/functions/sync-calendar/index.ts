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

    // 🔐 Verify critical secrets (do not log values)
    const hasUrl = Boolean(Deno.env.get('SUPABASE_URL'))
    const hasAnon = Boolean(Deno.env.get('SUPABASE_ANON_KEY'))
    const hasService = Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    console.log('🔐 Secrets availability -> SUPABASE_URL:', hasUrl, 'ANON_KEY:', hasAnon, 'SERVICE_ROLE_KEY:', hasService)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log('🧭 Supabase client initialized')

    // Helper: verify user from Authorization header
    const getUserFromAuth = async (): Promise<{ ok: boolean; userId?: string; email?: string; error?: unknown }> => {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        console.log('❌ CRITICAL ERROR: Missing authorization header')
        return { ok: false, error: 'Missing authorization header' }
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        console.log('❌ CRITICAL ERROR: Invalid or expired token', error)
        return { ok: false, error }
      }
      return { ok: true, userId: user.id, email: user.email ?? undefined }
    }

    const userRes = await getUserFromAuth()
    if (!userRes.ok || !userRes.userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('✅ USER VERIFIED: User ID:', userRes.userId, 'Email:', userRes.email)

    // Get the provider token from request body
    console.log('📥 Reading request body...')
    const requestBody = await req.json()
    console.log('📥 Request body received (keys):', Object.keys(requestBody || {}))
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
    if (calendars.length > 0) {
      console.log('🗂️ Calendar IDs:', calendars.map(c => c.id))
      console.log('🗂️ Calendar Summaries:', calendars.map(c => c.summary || 'Untitled'))
    }

    // Stage 2: iterate calendars and fetch events per calendar WITH PAGINATION and per-batch inserts
    let totalFetched = 0
    let totalInserted = 0
    for (const cal of calendars) {
      const calId = encodeURIComponent(cal.id)
      let pageToken: string | undefined = undefined
      let batchIndex = 0
      do {
        const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500${pageToken ? `&pageToken=${pageToken}` : ''}`
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
          break
        }
        const data: { items?: GoogleCalendarEvent[]; nextPageToken?: string } = await eventsResp.json()
        const batch = data.items || []
        batchIndex += 1
        totalFetched += batch.length
        console.log(`📦 BATCH SIZE [${cal.id}] #${batchIndex}:`, batch.length)
        console.log('🔁 Pagination token (nextPageToken):', data.nextPageToken || 'No, this is the last page.')

        // Log titles for visibility
        for (const ev of batch) {
          console.log('📝 EVENT TITLE:', ev.summary || 'Untitled')
        }

        // Build rows for this batch with google_event_id for upsert functionality
        const rows: Array<{ 
          google_event_id: string; 
          user_id: string; 
          google_event_data: GoogleCalendarEvent;
          processed: boolean;
        }> = batch.map((event) => ({
          google_event_id: event.id,      // CRITICAL: The unique ID as a top-level field
          user_id: userRes.userId!,
          google_event_data: event,       // The full original event data
          processed: false                // Reset the processed flag on update
        }))

        // Upsert this batch (further split into sub-batches of 100 to be safe)
        const chunkSize = 100
        const chunks = Math.ceil(rows.length / chunkSize)
        for (let i = 0; i < chunks; i++) {
          const start = i * chunkSize
          const end = Math.min(start + chunkSize, rows.length)
          const sub = rows.slice(start, end)
          if (sub.length === 0) continue
          console.log(`💾 UPSERT temp_meetings: calendar=${cal.id} batch#${batchIndex} sub#${i + 1}/${chunks} size=${sub.length}`)
          
          // Use Supabase client upsert instead of direct REST API call
          const { error: upsertError } = await supabase
            .from('temp_meetings')
            .upsert(sub, {
              onConflict: 'google_event_id' // CRITICAL: Tells Supabase how to find duplicates
            })
          
          console.log(`🧪 UPSERT RESULT:`, upsertError ?? 'ok')
          if (upsertError) {
            console.error('❌ UPSERT ERROR:', upsertError)
            return new Response(
              JSON.stringify({ error: 'Failed to upsert a batch into temp_meetings', details: upsertError.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          // Kickstart the processing pipeline with a single newly added row
          console.log('🚀 KICKSTART: Querying a newly added unprocessed temp_meeting row for user:', userRes.userId)
          const { data: kickstartRows, error: kickstartErr } = await supabase
            .from('temp_meetings')
            .select('id')
            .eq('user_id', userRes.userId!)
            .eq('processed', false)
            .limit(1)

          console.log('🔎 KICKSTART query result error:', kickstartErr, 'rows:', kickstartRows)
          const tempMeetingId = kickstartRows && kickstartRows[0]?.id
          if (tempMeetingId) {
            console.log('🔁 Invoking process-events with temp_meeting_id:', tempMeetingId)
            const { error: kickErr } = await supabase.functions.invoke('process-events', {
              body: { temp_meeting_id: tempMeetingId }
            })
            console.log('🧪 process-events invoke error:', kickErr ?? 'ok')
          } else {
            console.log('ℹ️ No unprocessed temp_meeting found to kickstart at this moment.')
          }
          totalInserted += sub.length // Note: This counts both inserts and updates
        }

        pageToken = data.nextPageToken
      } while (pageToken)
    }

    console.log(`📊 GOOGLE DATA (ALL CALENDARS): Total fetched=${totalFetched}, total upserted=${totalInserted}`)

    // After all calendars processed, return success
    if (totalFetched === 0) {
      console.log('⚠️ NO EVENTS: No events found from Google Calendar API')
    }
    console.log('✅ SYNC COMPLETED: returning 200 OK', { totalFetched, totalInserted })
    return new Response(
      JSON.stringify({ message: 'Sync completed', fetched: totalFetched, upserted: totalInserted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('💥 SYNC-CALENDAR UNCAUGHT ERROR:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})