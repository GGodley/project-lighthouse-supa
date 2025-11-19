import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // 1. Get the meeting_id directly from the request
    const { meeting_id, user_id, customer_id } = await req.json()
    
    // 2. Validate that meeting_id was provided
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: 'meeting_id is required.' }), {
        status: 400, // Bad Request
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const recallApiKey = Deno.env.get('RECALLAI_API_KEY')

    if (!recallApiKey) throw new Error('RECALLAI_API_KEY is missing.')

    const supabaseClient = createClient(supabaseUrl!, serviceKey!)

    // 3. Atomic lock: conditionally update status to 'scheduling_in_progress' only if status is 'new'
    console.log('Attempting atomic lock by updating status to scheduling_in_progress')
    const { count, error: lockError } = await supabaseClient
      .from('meetings')
      .update({ status: 'scheduling_in_progress' })
      .eq('google_event_id', meeting_id)
      .eq('status', 'new')
      .select('*', { count: 'exact', head: true })

    if (lockError) {
      console.error('Failed to acquire atomic lock:', lockError)
      return new Response(JSON.stringify({ error: 'Failed to acquire lock for scheduling' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Gatekeeper check: if count is 0, another instance won the race
    if (count === 0) {
      console.log('Job already claimed or not in \'new\' state. Exiting.')
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Job already claimed or not in new state'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    console.log('Successfully acquired atomic lock')

    // 4. Fetch meeting details after claiming the job
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('hangout_link, meeting_url, meeting_type, title, start_time')
      .eq('google_event_id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      console.error('Failed to fetch meeting details after lock:', meetingError)
      // Update status to error before throwing
      await supabaseClient
        .from('meetings')
        .update({ status: 'error' })
        .eq('google_event_id', meeting_id)
      return new Response(JSON.stringify({ error: 'Meeting not found after lock acquisition.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use meeting_url first (preferred), fall back to hangout_link for backward compatibility
    const meetingUrl = meeting.meeting_url || meeting.hangout_link

    if (!meetingUrl) {
      console.error('Meeting does not have a meeting URL (meeting_url or hangout_link)')
      // Update status to error before throwing
      await supabaseClient
        .from('meetings')
        .update({ status: 'error' })
        .eq('google_event_id', meeting_id)
      return new Response(JSON.stringify({ error: 'Meeting does not have a meeting URL for recording.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`📞 Using meeting URL: ${meetingUrl} (Type: ${meeting.meeting_type || 'unknown'})`)

    // Join 1 minute before the scheduled start_time
    const joinAtIso = new Date(new Date(meeting.start_time).getTime() - 60000).toISOString()

    const recallPayload = {
      meeting_url: meetingUrl, // Use the detected meeting URL (Google Meet or Zoom)
      join_at: joinAtIso,
      recording_config: {
        transcript: {
          provider: { 'gladia_v2_streaming': {} },
          // CHANGED: Use the static webhook URL
          webhook_url: `${supabaseUrl}/functions/v1/process-transcript`
        }
      }
    }

    const response = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
      method: 'POST',
      headers: { Authorization: `Token ${recallApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recallPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Recall.ai API failed:', errorBody)
      // Update status to error before throwing
      await supabaseClient
        .from('meetings')
        .update({ status: 'error' })
        .eq('google_event_id', meeting_id)
      throw new Error(`Recall.ai API failed: ${errorBody}`)
    }

    // Capture the Bot ID from the API Response
    const recallData = await response.json()
    const recallBotId = recallData.id

    // 5. Update meeting with recall_bot_id and final status
    console.log(`Updating meetings table with recall_bot_id: ${recallBotId}`)
    const { error: meetingUpdateError } = await supabaseClient
      .from('meetings')
      .update({ recall_bot_id: recallBotId, status: 'recording_scheduled' })
      .eq('google_event_id', meeting_id)

    if (meetingUpdateError) {
      console.error('Failed to update meetings table with recall_bot_id:', meetingUpdateError)
      return new Response(JSON.stringify({ error: 'Failed to update meeting with bot ID' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('Successfully updated meetings table with recall_bot_id')

    // 6. Insert the transcription job with recording_scheduled status
    console.log('Attempting to insert into transcription_jobs...')
    const { data: job, error: jobError } = await supabaseClient
      .from('transcription_jobs')
      .insert({
        recall_bot_id: recallBotId,
        meeting_id: meeting_id, // CRITICAL: Use the provided ID directly
        meeting_url: meetingUrl, // Use the detected meeting URL
        user_id: user_id,
        customer_id: customer_id,
        status: 'recording_scheduled'
      })
      .select()
      .single()

    if (jobError) {
      console.error('Supabase insert error:', jobError)
      return new Response(JSON.stringify({ error: 'Failed to create transcription job. Ensure meeting_id is valid.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('Successfully inserted into transcription_jobs.')

    // 6. Return the created job data
    return new Response(JSON.stringify({
      success: true, 
      message: 'Recall.ai bot dispatched.', 
      recall_bot_id: recallBotId,
      job: job
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in dispatch-recall-bot:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})
