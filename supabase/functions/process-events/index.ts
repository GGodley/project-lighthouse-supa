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
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  hangoutLink?: string | null
  attendees?: Attendee[]
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
    // Parse input
    const body = await req.json()
    const tempMeetingId: number | string | undefined = body?.temp_meeting_id
    if (!tempMeetingId) {
      console.error('❌ Missing temp_meeting_id in request body')
      return new Response(JSON.stringify({ error: 'temp_meeting_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    console.log('🚀 PROCESS-EVENTS: start with temp_meeting_id =', tempMeetingId)

    // Admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch target event (single)
    const { data: tempRow, error: fetchErr } = await supabase
      .from('temp_meetings')
      .select('*')
      .eq('id', tempMeetingId)
      .single()

    if (fetchErr || !tempRow) {
      console.error('❌ Could not fetch temp_meetings row:', fetchErr)
      return new Response(JSON.stringify({ error: 'Temp meeting not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId: string = tempRow.user_id
    const processed: boolean = Boolean(tempRow.processed)
    const event: GoogleCalendarEvent = tempRow.google_event_data
    console.log('📥 Loaded temp_meeting row. processed =', processed, 'user_id =', userId)

    // Get user email via admin API
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
    if (userErr || !userData?.user?.email) {
      console.error('❌ Could not load user record:', userErr)
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const userEmail = userData.user.email
    const userDomain = userEmail.split('@')[1]
    console.log('🔎 User email/domain:', userEmail, userDomain)

    // If already processed, skip to chain
    if (processed) {
      console.warn('⚠️ Temp meeting already processed. Skipping processing step.')
    } else {
      // Filtering: external attendee present?
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
      console.log('🧪 External attendee found =', isExternal)

      if (isExternal) {
        const startIso = event.start?.dateTime || event.start?.date || new Date().toISOString()
        const endIso = event.end?.dateTime || event.end?.date || startIso

        // Identify all external attendees (full objects)
        const externalAttendees: Attendee[] = attendees.filter((a) => {
          if (!a.email) return false
          const domain = a.email.split('@')[1]
          return Boolean(domain) && domain !== userDomain
        })

        // Populate attendees column: array of external emails
        const externalEmails: string[] = externalAttendees.map(a => a.email)

        // Determine primary meeting customer (first external domain)
        const externalDomains: (string | undefined)[] = externalAttendees.map(a => a.email?.split('@')[1])
        const primaryCustomer: string | null = (externalDomains.find(Boolean) as string | undefined) ?? null

        // Find or create customer linked to this meeting (by primary external domain, scoped to user)
        let customerId: string | null = null
        if (primaryCustomer) {
          console.log('🔎 Looking up customer by domain:', primaryCustomer)
          const { data: existingCustomer, error: findCustErr } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', userId)
            .eq('company_name', primaryCustomer)
            .maybeSingle()
          if (findCustErr) {
            console.error('❌ Customer lookup failed:', findCustErr)
          }
          if (existingCustomer?.id) {
            customerId = existingCustomer.id as string
            console.log('✅ Found existing customer id:', customerId)
          } else {
            const firstExternalEmail = externalAttendees[0]?.email || null
            const newCustomer = {
              user_id: userId,
              name: primaryCustomer,
              company_name: primaryCustomer,
              contact_email: firstExternalEmail,
              last_interaction_at: startIso,
            }
            console.log('➕ Creating new customer:', JSON.stringify(newCustomer))
            const { data: createdCustomer, error: createCustErr } = await supabase
              .from('customers')
              .insert(newCustomer)
              .select('id')
              .single()
            if (createCustErr) {
              console.error('❌ Customer create failed:', createCustErr)
            } else if (createdCustomer?.id) {
              customerId = createdCustomer.id as string
              console.log('✅ Created customer id:', customerId)
            }
          }
        } else {
          console.log('ℹ️ No primaryCustomer domain determined; skipping customer link.')
        }

        const upsertPayload = {
          user_id: userId,
          google_event_id: event.id,
          title: event.summary || 'Untitled Meeting',
          start_time: startIso,
          end_time: endIso,
          hangout_link: event.hangoutLink ?? null,
          attendees: externalEmails,
          meeting_customer: primaryCustomer,
          customer_id: customerId,
        }
        console.log('📦 UPSERT meetings payload:', JSON.stringify(upsertPayload))
        const { error: upsertErr } = await supabase
          .from('meetings')
          .upsert(upsertPayload, { onConflict: 'google_event_id,user_id' })
        if (upsertErr) {
          console.error('❌ Upsert meetings failed:', upsertErr)
          return new Response(JSON.stringify({ error: 'Upsert failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        console.log('✅ Upserted meeting for temp_meeting_id =', tempMeetingId)
      } else {
        console.log('ℹ️ Event not external; will mark as processed only.')
      }
    }

    // Mark current temp row as processed
    const { error: markErr } = await supabase
      .from('temp_meetings')
      .update({ processed: true })
      .eq('id', tempMeetingId)
    if (markErr) {
      console.error('❌ Failed to mark processed:', markErr)
      return new Response(JSON.stringify({ error: 'Mark processed failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    console.log('🔖 Marked processed for temp_meeting_id =', tempMeetingId)

    // Find next unprocessed row for same user
    const { data: nextRows, error: nextErr } = await supabase
      .from('temp_meetings')
      .select('id')
      .eq('user_id', userId)
      .eq('processed', false)
      .limit(1)
    if (nextErr) {
      console.error('❌ Failed to query next row:', nextErr)
      return new Response(JSON.stringify({ error: 'Next query failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const nextId: number | string | undefined = nextRows && nextRows[0]?.id
    if (nextId) {
      console.log('➡️ Continuing chain with next temp_meeting_id =', nextId)
      // Fire-and-forget; do not await
      void (async () => {
        await supabase.functions.invoke('process-events', { body: { temp_meeting_id: nextId } })
      })()
    } else {
      console.log('🏁 Chain complete for user_id =', userId)
    }

    return new Response(
      JSON.stringify({ message: 'Processed temp_meeting', temp_meeting_id: tempMeetingId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('💥 PROCESS-EVENTS UNCAUGHT ERROR:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})


