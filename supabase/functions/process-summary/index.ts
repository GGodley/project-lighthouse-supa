import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req)=>{
  try {
    const body = await req.json();
    const job = body.record;
    if (!job || !job.id || !job.meeting_id) {
      return new Response(JSON.stringify({
        error: 'Invalid payload: missing job or identifiers'
      }), {
        status: 400
      });
    }

    const raw = job.summary_raw_response ?? '';
    let discussionPoints = '';
    let actionItems = '';
    let sentimentText = 'Neutral'; // Default text
    let sentimentScore = 0;     // Default score (Neutral)

    try {
      const parsed = JSON.parse(raw);
      
      discussionPoints = typeof parsed.discussion_points === 'string' ? parsed.discussion_points.trim() : '';
      actionItems = typeof parsed.action_items === 'string' ? parsed.action_items.trim() : '';

      // Get the new sentiment text
      const s = typeof parsed.sentiment === 'string' ? parsed.sentiment.trim() : 'Neutral';
      sentimentText = [
        'Very Positive',
        'Positive',
        'Neutral',
        'Negative',
        'Frustrated'
      ].includes(s) ? s : 'Neutral';

      // Get the new sentiment score
      const score = parsed.sentiment_score;
      sentimentScore = typeof score === 'number' && score >= -3 && score <= 3 ? score : 0;

    } catch (e) {
      console.error('Failed to parse summary_raw_response JSON. Falling back to empty/neutral fields.', e);
      discussionPoints = '';
      actionItems = '';
      sentimentText = 'Neutral';
      sentimentScore = 0;
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // --- THIS IS THE KEY UPDATE ---
    // Update meetings with all four parsed sections
    const { error: meetingErr } = await supabase.from('meetings').update({
      summary: discussionPoints,
      next_steps: actionItems,
      customer_sentiment: sentimentText,  // The text (e.g., "Positive")
      sentiment_score: sentimentScore     // The number (e.g., 2)
    }).eq('google_event_id', job.meeting_id);
    // ----------------------------

    if (meetingErr) {
      console.error('Failed to update meetings:', meetingErr);
      throw new Error(`Failed to update meeting: ${meetingErr.message}`);
    }

    // Finalize transcription job status
    const { error: jobErr } = await supabase.from('transcription_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', job.id);

    if (jobErr) {
      console.error('Failed to update transcription_jobs:', jobErr);
      throw new Error(`Failed to update job status: ${jobErr.message}`);
    }

    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200
    });

  } catch (err) {
    console.error('process-summary error:', err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500
    });
  }
});


