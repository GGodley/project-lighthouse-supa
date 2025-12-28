import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';
import { decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

/**
 * Process Transcript Edge Function - Handles Recall.ai transcript.done webhook
 * 
 * Flow:
 * 1. Verify webhook signature
 * 2. Find meeting by recall_bot_id
 * 3. Fetch transcript from Recall.ai
 * 4. Format transcript with speaker names
 * 5. Save transcript to meetings.transcripts
 * 6. Update status to 'completed'
 * 7. Delete meeting data from Recall.ai
 * 8. Trigger Trigger.dev task for LLM analysis
 */
Deno.serve(async (req) => {
  try {
    console.log("[START] Webhook received from Recall.ai");

    // --- 1. Signature Verification ---
    console.log("[LOG] Verifying Svix signature...");
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error("Missing required Svix headers.");
    }
    const webhookSecretString = Deno.env.get("RECALL_WEBHOOK_SECRET");
    if (!webhookSecretString) throw new Error("RECALL_WEBHOOK_SECRET is not set.");
    const secret = webhookSecretString.substring(webhookSecretString.indexOf('_') + 1);
    const secretKey = decode(secret);
    const rawBody = await req.text();
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const hmac = createHmac("sha256", secretKey);
    hmac.update(signedContent);
    const expectedSignature = hmac.digest("base64");
    const receivedSignature = svixSignature.split(",")[1];
    if (receivedSignature !== expectedSignature) {
      return new Response('Unauthorized: Signature mismatch', { status: 401 });
    }
    console.log("[SUCCESS] Signature verification passed.");

    // --- 2. Payload Processing ---
    const payload = JSON.parse(rawBody);
    console.log(`[LOG] Event type: '${payload.event}'`);

    if (payload.event === 'transcript.done') {
      console.log("[LOG] Processing transcript.done event");

      const botIdFromPayload = payload.data?.bot?.id;
      if (!botIdFromPayload) {
        throw new Error('Could not find bot.id in payload.');
      }
      console.log(`[LOG] Bot ID: ${botIdFromPayload}`);

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // --- 3. Find Meeting by recall_bot_id ---
      console.log(`[LOG] Finding meeting with recall_bot_id: ${botIdFromPayload}`);
      const { data: meeting, error: meetingError } = await supabaseClient
        .from('meetings')
        .select('id, google_event_id, user_id, customer_id')
        .eq('recall_bot_id', botIdFromPayload)
        .maybeSingle();

      if (meetingError) {
        throw new Error(`Database error: ${meetingError.message}`);
      }

      if (!meeting) {
        console.warn(`No meeting found for bot_id: ${botIdFromPayload}`);
        return new Response("OK (no matching meeting found)", { status: 200 });
      }

      console.log(`[LOG] Found meeting: id=${meeting.id}, google_event_id=${meeting.google_event_id}`);

      // --- 4. Fetch Transcript from Recall.ai ---
      const transcriptId = payload.data?.transcript?.id;
      if (!transcriptId) {
        throw new Error('Webhook payload is missing transcript ID.');
      }
      console.log(`[LOG] Fetching transcript ${transcriptId} from Recall.ai`);

      const recallApiKey = Deno.env.get('RECALLAI_API_KEY');
      if (!recallApiKey) {
        throw new Error('RECALLAI_API_KEY not configured');
      }

      // Fetch transcript metadata
      const metaResponse = await fetch(
        `https://us-west-2.recall.ai/api/v1/transcript/${transcriptId}`,
        { headers: { Authorization: `Token ${recallApiKey}` } }
      );
      if (!metaResponse.ok) {
        throw new Error(`Failed to fetch transcript metadata: ${metaResponse.status}`);
      }

      const metaData = await metaResponse.json();
      const downloadUrl = metaData?.data?.download_url;
      if (!downloadUrl) {
        throw new Error('Metadata is missing the download_url');
      }

      // Download transcript content
      console.log(`[LOG] Downloading transcript content...`);
      const contentResponse = await fetch(downloadUrl);
      if (!contentResponse.ok) {
        throw new Error(`Failed to download transcript: ${contentResponse.status}`);
      }
      const transcriptContent = await contentResponse.json();
      console.log(`[LOG] Transcript downloaded successfully`);

      // --- 5. Format Transcript with Speaker Names ---
      // Transcript structure from Recall.ai: Array of segments with participant info
      let formattedTranscript = '';
      if (Array.isArray(transcriptContent)) {
        const transcriptLines: string[] = [];
        
        for (const segment of transcriptContent) {
          // Extract speaker name
          const speakerName = segment.participant?.name || 
                            segment.participant?.email?.split('@')[0] || 
                            'Unknown Speaker';
          
          // Extract words and combine into text
          let segmentText = '';
          if (Array.isArray(segment.words)) {
            segmentText = segment.words.map((w: any) => w.text).join(' ');
          } else if (segment.text) {
            segmentText = segment.text;
          }

          if (segmentText.trim()) {
            // Format: "Speaker Name: text"
            transcriptLines.push(`${speakerName}: ${segmentText}`);
          }
        }
        
        formattedTranscript = transcriptLines.join('\n\n');
      } else {
        // Fallback: if not array format, try to extract text
        formattedTranscript = JSON.stringify(transcriptContent);
      }

      if (!formattedTranscript || formattedTranscript.trim().length < 50) {
        throw new Error('Transcript is too short or empty');
      }

      console.log(`[LOG] Formatted transcript (length: ${formattedTranscript.length})`);

      // --- 6. Save Transcript to Meetings Table ---
      console.log(`[LOG] Saving transcript to meetings table...`);
      const { error: transcriptUpdateError } = await supabaseClient
        .from('meetings')
        .update({
          transcripts: formattedTranscript,
          status: 'recording_scheduled', // Status remains recording_scheduled (used for completed meetings with transcript)
          updated_at: new Date().toISOString(),
        })
        .eq('id', meeting.id);

      if (transcriptUpdateError) {
        throw new Error(`Failed to save transcript: ${transcriptUpdateError.message}`);
      }
      console.log(`[SUCCESS] Transcript saved to meetings table`);

      // --- 7. Delete Meeting Data from Recall.ai ---
      console.log(`[LOG] Deleting meeting data from Recall.ai...`);
      try {
        const deleteResponse = await fetch(
          `https://us-west-2.recall.ai/api/v1/bot/${botIdFromPayload}/delete_media/`,
          {
            method: 'POST',
            headers: {
              Authorization: `Token ${recallApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.warn(`⚠️  Failed to delete Recall.ai media: ${deleteResponse.status}`);
        } else {
          console.log(`[SUCCESS] Recall.ai media deleted`);
        }
      } catch (deleteError) {
        console.warn(`⚠️  Error deleting Recall.ai media:`, deleteError);
        // Don't fail the webhook - transcript is saved
      }

      // --- 8. Trigger Trigger.dev Function for LLM Analysis ---
      console.log(`[LOG] Triggering Trigger.dev for LLM analysis...`);
      try {
        const triggerApiKey = Deno.env.get("TRIGGER_API_KEY");
        if (!triggerApiKey) {
          throw new Error("TRIGGER_API_KEY not configured");
        }

        const triggerUrl = `https://api.trigger.dev/api/v1/tasks/generate-meeting-summary/trigger`;
        const triggerResponse = await fetch(triggerUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${triggerApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload: {
              meetingId: meeting.id.toString(), // Pass meetings.id (BIGINT as string)
              googleEventId: meeting.google_event_id,
              transcript: formattedTranscript,
              userId: meeting.user_id,
            },
          }),
        });

        if (!triggerResponse.ok) {
          const errorText = await triggerResponse.text();
          throw new Error(
            `Failed to trigger Trigger.dev: ${triggerResponse.status} - ${errorText}`
          );
        }

        console.log(`[SUCCESS] Trigger.dev task triggered for meeting analysis`);
      } catch (triggerError) {
        console.error(`⚠️  Failed to trigger Trigger.dev:`, triggerError);
        // Don't fail the webhook - transcript is saved, can retry analysis later
      }
    }

    console.log("[END] Process complete. Returning 200 OK.");
    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error) {
    console.error('Error in process-transcript webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500 }
    );
  }
});
