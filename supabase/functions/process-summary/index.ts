import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type WebhookPayload = {
  record: TranscriptionJobRecord
}

type TranscriptionJobRecord = {
  id: string
  meeting_id: string
  summary_raw_response: string | null
}

// No parsing helpers needed; we now accept strict JSON (discussion_points, action_items, sentiment)

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as WebhookPayload
    const job = body.record

    if (!job || !job.id || !job.meeting_id) {
      return new Response(JSON.stringify({ error: 'Invalid payload: missing job or identifiers' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse strict JSON response from generate-summary
    const raw = job.summary_raw_response ?? ''
    let discussionPoints = ''
    let actionItems = ''
    let sentimentText = 'neutral'
    try {
      const parsed = JSON.parse(raw) as { discussion_points?: unknown; action_items?: unknown; sentiment?: unknown }
      discussionPoints = typeof parsed.discussion_points === 'string' ? parsed.discussion_points.trim() : ''
      actionItems = typeof parsed.action_items === 'string' ? parsed.action_items.trim() : ''
      const s = typeof parsed.sentiment === 'string' ? parsed.sentiment.trim().toLowerCase() : 'neutral'
      sentimentText = ['positive', 'negative', 'neutral'].includes(s) ? s : 'neutral'
    } catch (e) {
      console.error('Failed to parse summary_raw_response JSON. Falling back to empty fields.', e)
      discussionPoints = ''
      actionItems = ''
      sentimentText = 'neutral'
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Update meetings with parsed sections
    const { error: meetingErr } = await supabase
      .from('meetings')
      .update({ summary: discussionPoints, next_steps: actionItems, customer_sentiment: sentimentText })
      .eq('google_event_id', job.meeting_id)

    if (meetingErr) {
      console.error('Failed to update meetings:', meetingErr)
      return new Response(JSON.stringify({ error: 'Failed to update meeting' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Finalize transcription job status
    const { error: jobErr } = await supabase
      .from('transcription_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id)

    if (jobErr) {
      console.error('Failed to update transcription_jobs:', jobErr)
      return new Response(JSON.stringify({ error: 'Failed to update job status' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('process-summary error:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})


