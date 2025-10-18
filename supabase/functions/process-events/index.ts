import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Attendee = {
  email: string
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
}

type GoogleCalendarEvent = {
  id: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  hangoutLink?: string | null
  attendees?: Attendee[]
}

type TempMeetingRow = {
  id: number
  user_id: string
  processed: boolean
  google_event_data: GoogleCalendarEvent
}

type MeetingPayload = {
  user_id: string
  google_event_id: string
  title: string
  start_time: string
  end_time: string
  hangout_link: string | null
  attendees: string[]
  meeting_customer: string | null
  customer_id: string | null
  status: string
  dispatch_status: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 PROCESS-EVENTS: Starting batch processing of new meetings')

    // Admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Step 1: Select all temp meetings with external participants that don't exist in main meetings table
    const { data: tempMeetings, error: tempErr } = await supabase
      .from('temp_meetings')
      .select('*')
      .eq('processed', false)

    if (tempErr) {
      console.error('❌ Failed to fetch temp meetings:', tempErr)
      return new Response(JSON.stringify({ error: 'Failed to fetch temp meetings' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!tempMeetings || tempMeetings.length === 0) {
      console.log('ℹ️ No unprocessed temp meetings found')
      return new Response(JSON.stringify({ message: 'No meetings to process' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`📥 Found ${tempMeetings.length} unprocessed temp meetings`)

    // Process each temp meeting
    for (const tempRow of tempMeetings) {
      const tempMeeting: TempMeetingRow = tempRow as TempMeetingRow
      const userId: string = tempMeeting.user_id
      const event: GoogleCalendarEvent = tempMeeting.google_event_data
      
      console.log(`🔄 Processing temp_meeting_id: ${tempMeeting.id} for user: ${userId}`)

      // Get user email via admin API
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
      if (userErr || !userData?.user?.email) {
        console.error('❌ Could not load user record:', userErr)
        continue
      }
      const userEmail = userData.user.email
      const userDomain = userEmail.split('@')[1]

      // Check if meeting already exists in main table
      const { data: existingMeeting, error: existingErr } = await supabase
        .from('meetings')
        .select('google_event_id')
        .eq('google_event_id', event.id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existingErr) {
        console.error('❌ Error checking existing meeting:', existingErr)
        continue
      }

      if (existingMeeting) {
        console.log('ℹ️ Meeting already exists, skipping:', event.id)
        // Mark as processed and continue
        await supabase
          .from('temp_meetings')
          .update({ processed: true })
          .eq('id', tempMeeting.id)
        continue
      }

      // Check for external attendees
      const attendees: Attendee[] = event.attendees || []
      let isExternal = false
      for (const a of attendees) {
        if (!a.email) continue
        const aDomain = a.email.split('@')[1]
        if (aDomain && aDomain !== userDomain) {
          isExternal = true
          break
        }
      }

      if (!isExternal) {
        console.log('ℹ️ No external attendees, marking as processed')
        await supabase
          .from('temp_meetings')
          .update({ processed: true })
          .eq('id', tempMeeting.id)
        continue
      }

      const startIso = event.start?.dateTime || event.start?.date || new Date().toISOString()
      const endIso = event.end?.dateTime || event.end?.date || startIso

      // Identify all external attendees
      const externalAttendees: Attendee[] = attendees.filter((a) => {
        if (!a.email) return false
        const domain = a.email.split('@')[1]
        return Boolean(domain) && domain !== userDomain
      })

      const externalEmails: string[] = externalAttendees.map(a => a.email)
      const externalDomains: (string | undefined)[] = externalAttendees.map(a => a.email?.split('@')[1])
      const primaryCustomer: string | null = (externalDomains.find(Boolean) as string | undefined) ?? null

      console.log(`🔍 Searching for existing customer using emails: ${externalEmails.join(', ')}`);

      let customerId = null;
      let companyId = null;

      // Find the first customer that matches any of the external attendees
      const { data: customer, error: findErr } = await supabase
        .from('customers')
        .select('customer_id, company_id')
        .in('email', externalEmails)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (findErr) {
        console.error('❌ Customer lookup failed:', findErr);
      } else if (customer) {
        // We found a match!
        customerId = customer.customer_id;
        companyId = customer.company_id;
        console.log(`✅ Found matching customer: ${customerId} (Company: ${companyId})`);
      } else {
        // No match was found.
        console.warn(`ℹ️ No known customer found for this meeting. The meeting will be saved without a customer link.`);
      }

      // Determine status
      const isPastEvent = new Date(endIso).getTime() < Date.now()
      const statusToSet = isPastEvent ? 'passed_event' : 'new'

      // Step a: Create the Meeting Record with dispatch_status 'pending'
      const meetingPayload: MeetingPayload = {
        user_id: userId,
        google_event_id: event.id,
        title: event.summary || 'Untitled Meeting',
        start_time: startIso,
        end_time: endIso,
        hangout_link: event.hangoutLink ?? null,
        attendees: externalEmails,
        meeting_customer: externalEmails.length > 0 ? externalEmails[0] : null,
        customer_id: customerId,
        status: statusToSet,
        dispatch_status: 'pending'
      }

      console.log('📦 Creating meeting record:', JSON.stringify(meetingPayload))
      const { error: insertErr } = await supabase
        .from('meetings')
        .insert(meetingPayload)

      if (insertErr) {
        console.error('❌ Failed to insert meeting:', insertErr)
        continue
      }

      // Step b: Atomic Lock - try to update dispatch_status to 'processing'
      console.log('🔒 Attempting atomic lock for meeting:', event.id)
      const { count, error: lockErr } = await supabase
        .from('meetings')
        .update({ dispatch_status: 'processing' })
        .eq('google_event_id', event.id)
        .eq('user_id', userId)
        .eq('dispatch_status', 'pending')
        .select('*', { count: 'exact', head: true })

      if (lockErr) {
        console.error('❌ Failed to acquire lock:', lockErr)
        continue
      }

      // Step c: Check the Lock
      if (count === 0) {
        console.log('ℹ️ Another process is handling this meeting, skipping:', event.id)
        continue
      }

      console.log('✅ Successfully acquired lock for meeting:', event.id)

      // Step d: Dispatch the Bot (only for future meetings)
      if (statusToSet === 'new') {
        console.log('🤖 Dispatching bot for meeting:', event.id)
        try {
          await supabase.functions.invoke('dispatch-recall-bot', {
            body: {
              meeting_id: event.id,
              user_id: userId,
              customer_id: customerId
            }
          })
          console.log('✅ Successfully dispatched bot for meeting:', event.id)
        } catch (botErr) {
          console.error('❌ Failed to dispatch bot:', botErr)
        }
      } else {
        console.log('ℹ️ Past event, skipping bot dispatch for meeting:', event.id)
      }

      // Step e: Update on Success
      const { error: completeErr } = await supabase
        .from('meetings')
        .update({ dispatch_status: 'completed' })
        .eq('google_event_id', event.id)
        .eq('user_id', userId)

      if (completeErr) {
        console.error('❌ Failed to update dispatch_status to completed:', completeErr)
      } else {
        console.log('✅ Updated dispatch_status to completed for meeting:', event.id)
      }

      // Mark temp meeting as processed
      await supabase
        .from('temp_meetings')
        .update({ processed: true })
        .eq('id', tempMeeting.id)
    }

    console.log('🏁 Batch processing complete')
    return new Response(
      JSON.stringify({ message: 'Batch processing completed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('💥 PROCESS-EVENTS UNCAUGHT ERROR:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})


