import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type WebhookPayload = {
  record: CleanupJobRecord
}

type CleanupJobRecord = {
  id: string
  meeting_id: string
  recall_bot_id: string
}

function assertEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload
    const job = payload?.record

    if (!job || !job.meeting_id || !job.recall_bot_id) {
      console.error('Invalid payload. Required fields missing.', { job })
      return new Response(JSON.stringify({ error: 'Missing meeting_id or recall_bot_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const recallApiKey = assertEnv('RECALLAI_API_KEY')
    const supabaseUrl = assertEnv('SUPABASE_URL')
    const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY')

    const supabase = createClient(supabaseUrl, serviceKey)

    // 1) Recall.ai media cleanup
    const deleteUrl = `https://us-west-2.recall.ai/api/v1/bot/${job.recall_bot_id}/delete_media/`
    console.log('Attempting Recall.ai media deletion at:', deleteUrl)
    const recallResp = await fetch(deleteUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${recallApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'cleanup-meeting-data' }),
    })

    if (!recallResp.ok) {
      const text = await recallResp.text()
      console.error('Recall.ai media deletion failed:', text)
      return new Response(JSON.stringify({ error: 'Recall.ai media deletion failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('✅ Recall.ai media deletion successful for bot:', job.recall_bot_id)

    // 2) Supabase cleanup: delete temp_meetings by google_event_id
    console.log('Attempting to delete temp_meetings row for google_event_id:', job.meeting_id)
    const { error: deleteErr } = await supabase
      .from('temp_meetings')
      .delete()
      .eq('google_event_id', job.meeting_id)

    if (deleteErr) {
      console.error('Failed to delete temp_meetings row:', deleteErr)
      return new Response(JSON.stringify({ error: 'Failed to delete temp_meetings row' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('✅ temp_meetings row deleted for google_event_id:', job.meeting_id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('cleanup-meeting-data error:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})


