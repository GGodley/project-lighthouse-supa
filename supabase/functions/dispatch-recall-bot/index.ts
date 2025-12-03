import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { MeetingStatus, ErrorDetails } from '../_shared/meeting-utils.ts'
import { logError, logBotOperation, logMeetingEvent, generateCorrelationId } from '../_shared/logging-utils.ts'

Deno.serve(async (req) => {
  const correlationId = generateCorrelationId()
  
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

    if (!recallApiKey) {
      throw new Error('RECALLAI_API_KEY is missing.')
    }

    const supabaseClient = createClient(supabaseUrl!, serviceKey!)

    // 3. Fetch meeting first to check retry_count and status
    const { data: meetingCheck, error: meetingCheckError } = await supabaseClient
      .from('meetings')
      .select('id, status, retry_count, meeting_url, hangout_link')
      .eq('google_event_id', meeting_id)
      .single()

    if (meetingCheckError || !meetingCheck) {
      logError(undefined, meetingCheckError || new Error('Meeting not found'), {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'check_meeting_before_dispatch',
        correlationId
      }, 'high')
      return new Response(JSON.stringify({ error: 'Meeting not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const meetingId = meetingCheck.id.toString()

    // Check retry count - don't retry if exceeded
    if (meetingCheck.retry_count && meetingCheck.retry_count >= 3) {
      logMeetingEvent('warn', 'max_retries_exceeded', {
        meetingId,
        googleEventId: meeting_id,
        userId: user_id,
        retryCount: meetingCheck.retry_count,
        correlationId
      })
      return new Response(JSON.stringify({ 
        error: 'Maximum retry attempts exceeded.',
        retry_count: meetingCheck.retry_count
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate meeting has URL
    const meetingUrl = meetingCheck.meeting_url || meetingCheck.hangout_link
    if (!meetingUrl) {
      logError(meetingId, new Error('Meeting has no meeting URL'), {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'validate_meeting_url',
        correlationId
      }, 'high')
      
      await supabaseClient
        .from('meetings')
        .update({
          status: 'missing_url',
          error_details: {
            type: 'MissingMeetingUrl',
            message: 'Meeting does not have a meeting URL for recording',
            context: { operation: 'dispatch_bot' },
            timestamp: new Date().toISOString(),
            operation: 'dispatch_bot'
          } as ErrorDetails,
          last_error_at: new Date().toISOString()
        })
        .eq('id', meetingCheck.id)
      
      return new Response(JSON.stringify({ error: 'Meeting does not have a meeting URL for recording.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Atomic lock: conditionally update status to 'scheduling_in_progress' only if status is 'new' or 'rescheduling'
    logMeetingEvent('info', 'attempting_atomic_lock', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      currentStatus: meetingCheck.status,
      correlationId
    })

    const { count, error: lockError } = await supabaseClient
      .from('meetings')
      .update({ status: 'scheduling_in_progress' })
      .eq('google_event_id', meeting_id)
      .in('status', ['new', 'rescheduling'])
      .select('*', { count: 'exact', head: true })

    if (lockError) {
      logError(meetingId, lockError, {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'acquire_lock',
        correlationId
      }, 'high')
      return new Response(JSON.stringify({ error: 'Failed to acquire lock for scheduling' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Gatekeeper check: if count is 0, another instance won the race
    if (count === 0) {
      logMeetingEvent('info', 'lock_already_acquired', {
        meetingId,
        googleEventId: meeting_id,
        userId: user_id,
        currentStatus: meetingCheck.status,
        correlationId
      })
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Job already claimed or not in valid state'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    logMeetingEvent('info', 'atomic_lock_acquired', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      correlationId
    })

    // 5. Fetch meeting details after claiming the job
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('hangout_link, meeting_url, meeting_type, title, start_time, retry_count')
      .eq('google_event_id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      logError(meetingId, meetingError || new Error('Meeting not found after lock'), {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'fetch_meeting_after_lock',
        correlationId
      }, 'critical')
      
      // Update status to error before throwing
      await supabaseClient
        .from('meetings')
        .update({
          status: 'error',
          error_details: {
            type: 'MeetingNotFoundAfterLock',
            message: 'Meeting not found after lock acquisition',
            context: { operation: 'fetch_meeting' },
            timestamp: new Date().toISOString(),
            operation: 'fetch_meeting_after_lock'
          } as ErrorDetails,
          last_error_at: new Date().toISOString()
        })
        .eq('google_event_id', meeting_id)
      return new Response(JSON.stringify({ error: 'Meeting not found after lock acquisition.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use meeting_url first (preferred), fall back to hangout_link for backward compatibility
    const finalMeetingUrl = meeting.meeting_url || meeting.hangout_link

    if (!finalMeetingUrl) {
      logError(meetingId, new Error('Meeting URL missing after lock'), {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'validate_url_after_lock',
        correlationId
      }, 'critical')
      
      await supabaseClient
        .from('meetings')
        .update({
          status: 'missing_url',
          error_details: {
            type: 'MissingMeetingUrl',
            message: 'Meeting does not have a meeting URL for recording',
            context: { operation: 'dispatch_bot' },
            timestamp: new Date().toISOString(),
            operation: 'dispatch_bot'
          } as ErrorDetails,
          last_error_at: new Date().toISOString()
        })
        .eq('google_event_id', meeting_id)
      return new Response(JSON.stringify({ error: 'Meeting does not have a meeting URL for recording.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    logMeetingEvent('info', 'using_meeting_url', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      meetingUrl: finalMeetingUrl,
      meetingType: meeting.meeting_type || 'unknown',
      correlationId
    })

    // Join 1 minute before the scheduled start_time
    const joinAtIso = new Date(new Date(meeting.start_time).getTime() - 60000).toISOString()

    const recallPayload = {
      meeting_url: finalMeetingUrl, // Use the detected meeting URL (Google Meet or Zoom)
      join_at: joinAtIso,
      recording_config: {
        transcript: {
          provider: { 'gladia_v2_streaming': {} },
          // CHANGED: Use the static webhook URL
          webhook_url: `${supabaseUrl}/functions/v1/process-transcript`
        }
      }
    }

    logMeetingEvent('info', 'calling_recall_api', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      joinAt: joinAtIso,
      correlationId
    })

    const response = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
      method: 'POST',
      headers: { Authorization: `Token ${recallApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recallPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      const error = new Error(`Recall.ai API failed: ${errorBody}`)
      
      logError(meetingId, error, {
        googleEventId: meeting_id,
        userId: user_id,
        operation: 'recall_api_call',
        statusCode: response.status,
        correlationId
      }, 'high')
      
      // Increment retry count
      const newRetryCount = (meeting.retry_count || 0) + 1
      
      // Update status to error with details
      await supabaseClient
        .from('meetings')
        .update({
          status: 'error',
          error_details: {
            type: 'RecallApiFailed',
            message: `Recall.ai API failed: ${errorBody}`,
            context: { 
              operation: 'create_bot',
              statusCode: response.status,
              retryCount: newRetryCount
            },
            timestamp: new Date().toISOString(),
            operation: 'recall_api_call'
          } as ErrorDetails,
          last_error_at: new Date().toISOString(),
          retry_count: newRetryCount
        })
        .eq('google_event_id', meeting_id)
      
      throw error
    }

    // Capture the Bot ID from the API Response
    const recallData = await response.json()
    const recallBotId = recallData.id

    logBotOperation(
      'create',
      recallBotId,
      meetingId,
      'success',
      { googleEventId: meeting_id, userId: user_id, correlationId }
    )

    // 6. Update meeting with recall_bot_id and final status
    logMeetingEvent('info', 'updating_meeting_with_bot_id', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      botId: recallBotId,
      correlationId
    })

    const { error: meetingUpdateError } = await supabaseClient
      .from('meetings')
      .update({
        recall_bot_id: recallBotId,
        status: 'recording_scheduled',
        error_details: null, // Clear any previous errors
        last_error_at: null,
        retry_count: 0 // Reset retry count on success
      })
      .eq('google_event_id', meeting_id)

    if (meetingUpdateError) {
      logError(meetingId, meetingUpdateError, {
        googleEventId: meeting_id,
        userId: user_id,
        botId: recallBotId,
        operation: 'update_meeting_with_bot_id',
        correlationId
      }, 'critical')
      
      return new Response(JSON.stringify({ error: 'Failed to update meeting with bot ID' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    logMeetingEvent('info', 'meeting_updated_with_bot_id', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      botId: recallBotId,
      correlationId
    })

    // 7. Insert the transcription job with recording_scheduled status
    logMeetingEvent('info', 'inserting_transcription_job', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      botId: recallBotId,
      correlationId
    })

    const { data: job, error: jobError } = await supabaseClient
      .from('transcription_jobs')
      .insert({
        recall_bot_id: recallBotId,
        meeting_id: meeting_id, // CRITICAL: Use the provided ID directly
        meeting_url: finalMeetingUrl, // Use the detected meeting URL
        user_id: user_id,
        customer_id: customer_id,
        status: 'recording_scheduled'
      })
      .select()
      .single()

    if (jobError) {
      logError(meetingId, jobError, {
        googleEventId: meeting_id,
        userId: user_id,
        botId: recallBotId,
        operation: 'insert_transcription_job',
        correlationId
      }, 'high')
      
      return new Response(JSON.stringify({ error: 'Failed to create transcription job. Ensure meeting_id is valid.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    logMeetingEvent('info', 'transcription_job_created', {
      meetingId,
      googleEventId: meeting_id,
      userId: user_id,
      jobId: job.id,
      correlationId
    })

    // 8. Return the created job data
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
    logError(undefined, error, {
      operation: 'dispatch_recall_bot',
      correlationId
    }, 'critical')
    
    return new Response(JSON.stringify({ error: (error as Error).message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
