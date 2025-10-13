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

    // 3. Fetch meeting details to get the meeting_url for Recall.ai API
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('hangout_link, title, start_time')
      .eq('google_event_id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      return new Response(JSON.stringify({ error: 'Meeting not found. Ensure meeting_id is valid.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!meeting.hangout_link) {
      return new Response(JSON.stringify({ error: 'Meeting does not have a hangout link for recording.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Join 1 minute before the scheduled start_time
    const joinAtIso = new Date(new Date(meeting.start_time).getTime() - 60000).toISOString()

    const recallPayload = {
      meeting_url: meeting.hangout_link,
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
      throw new Error(`Recall.ai API failed: ${errorBody}`)
    }

    // Capture the Bot ID from the API Response
    const recallData = await response.json()
    const recallBotId = recallData.id

    // 4. Insert the transcription job directly using the provided meeting_id
    console.log('Attempting to insert into transcription_jobs...')
    const { data: job, error: jobError } = await supabaseClient
      .from('transcription_jobs')
      .insert({
        recall_bot_id: recallBotId,
        meeting_id: meeting_id, // CRITICAL: Use the provided ID directly
        meeting_url: meeting.hangout_link,
        user_id: user_id,
        customer_id: customer_id,
        status: 'scheduled'
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

    // 5. Update meeting status to indicate recording is in progress
    await supabaseClient.from('meetings').update({ status: 'recording_scheduled' }).eq('google_event_id', meeting_id)

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
