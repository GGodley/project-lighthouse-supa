import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';
import { decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

Deno.serve(async (req) => {
  try {
    console.log("[START] Webhook received. Beginning process.");

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
    console.log(`[LOG] Event type is: '${payload.event}'`);

    if (payload.event === 'transcript.done') {
      console.log("[LOG] Event is 'transcript.done'. Starting main logic.");

      const botIdFromPayload = payload.data?.bot?.id;
      if (!botIdFromPayload) throw new Error('Could not find bot.id in payload.');
      console.log(`[LOG] Extracted bot_id from payload: ${botIdFromPayload}`);
      
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // --- 3. Database Lookup ---
      console.log(`[LOG] Searching for meeting with recall_bot_id: ${botIdFromPayload}`);
      const { data: meeting, error: meetingFetchError } = await supabaseClient
        .from('meetings')
        .select('google_event_id')
        .eq('recall_bot_id', botIdFromPayload)
        .maybeSingle();

      if (meetingFetchError) {
        console.error(`Database fetch error: ${meetingFetchError.message}`);
        throw new Error(`Database fetch error: ${meetingFetchError.message}`);
      }
      
      if (!meeting) {
        console.warn(`No meeting found for bot_id: ${botIdFromPayload}. Returning 200 to stop webhook retries.`);
        return new Response("OK (no matching meeting found)", { status: 200 });
      }
      
      console.log(`[LOG] Found meeting with google_event_id: ${meeting.google_event_id}`);
      
      // Note: We don't change status here - meeting should already be 'recording_scheduled'
      // The transcript processing doesn't change the meeting status
      console.log(`[LOG] Processing transcript for meeting (status remains 'recording_scheduled')`);
      
      // Now fetch the transcription job using BOTH the meeting's google_event_id
      // and the current bot_id. This makes the lookup resilient to historical
      // jobs for the same meeting that were created by previous bots.
      const {
        data: jobs,
        error: fetchError,
        count: jobCount,
      } = await supabaseClient
        .from('transcription_jobs')
        .select('id, status', { count: 'exact' })
        .eq('meeting_id', meeting.google_event_id)
        .eq('recall_bot_id', botIdFromPayload)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error(`Database fetch error: ${fetchError.message}`);
        throw new Error(`Database fetch error: ${fetchError.message}`);
      }

      const job = jobs && jobs.length > 0 ? jobs[0] : null;

      if (jobCount && jobCount > 1) {
        console.warn(
          `[WARN] Multiple transcription_jobs found for meeting_id=${meeting.google_event_id} and recall_bot_id=${botIdFromPayload}. Using the most recent one by created_at.`
        );
      }

      if (!job) {
        console.warn(`No transcription job found for meeting: ${meeting.google_event_id}. Returning 200 to stop webhook retries.`);
        return new Response("OK (no matching job found)", { status: 200 });
      }
      
      console.log(`[LOG] Found job ${job.id} with status: '${job.status}'`);

      // --- 4. Idempotency Check ---
      if (job.status === 'completed' || job.status === 'failed') {
        console.log(`[LOG] Job is already finished with status: '${job.status}'. Exiting successfully.`);
        return new Response("OK (already processed)", { status: 200 });
      }
      console.log("[LOG] Idempotency check passed. Job status:", job.status);

      // --- 5. Fetch Transcript from Recall.ai ---
      const transcriptId = payload.data?.transcript?.id;
      if (!transcriptId) throw new Error('Webhook payload is missing transcript ID.');
      console.log(`[LOG] Fetching metadata for transcript_id: ${transcriptId}`);
      
      const recallApiKey = Deno.env.get('RECALLAI_API_KEY');
      const metaResponse = await fetch(`https://us-west-2.recall.ai/api/v1/transcript/${transcriptId}`, { headers: { Authorization: `Token ${recallApiKey}` } });
      if (!metaResponse.ok) throw new Error('Failed to fetch transcript metadata.');
      
      const metaData = await metaResponse.json();
      const downloadUrl = metaData?.data?.download_url;
      if (!downloadUrl) throw new Error('Metadata is missing the download_url.');
      console.log(`[LOG] Got download URL. Downloading transcript content...`);
      
      const contentResponse = await fetch(downloadUrl);
      if (!contentResponse.ok) throw new Error('Failed to download transcript content.');
      const transcriptContent = await contentResponse.json();
      console.log(`[LOG] Transcript content downloaded successfully.`);

      // --- 6. Process Transcript Text ---
      let fullText = '';
      if (Array.isArray(transcriptContent)) {
        fullText = transcriptContent.map((p: any) => p.words.map((w: any) => w.text).join(' ')).join('\n');
      }
      console.log(`[LOG] Transcript processed into fullText (length: ${fullText.length})`);
      
      // --- 7. Verify Transcript Data ---
      const isTranscriptValid = 
        fullText.length > 100 && 
        Array.isArray(transcriptContent) && 
        transcriptContent.length > 0;
      
      if (!isTranscriptValid) {
        console.warn(`[WARNING] Transcript validation failed. fullText length: ${fullText.length}, transcriptContent is array: ${Array.isArray(transcriptContent)}, transcriptContent length: ${Array.isArray(transcriptContent) ? transcriptContent.length : 'N/A'}`);
        console.warn(`[WARNING] Skipping cleanup - transcript may need to be re-fetched.`);
        // Still save what we have, but don't trigger cleanup
      } else {
        console.log(`[LOG] Transcript validation passed. Proceeding with storage and cleanup.`);
      }
      
      // --- 8. Update transcription_jobs with transcript ---
      console.log(`[LOG] Attempting to update job ${job.id} in database...`);
      const { error: updateError } = await supabaseClient
        .from('transcription_jobs')
        .update({
          transcript_text: fullText,
          utterances: transcriptContent,
          status: 'awaiting_summary',
        })
        .eq('id', job.id);
        
      if (updateError) {
        // This will catch if the update itself fails for any reason
        console.error("DATABASE UPDATE FAILED:", updateError);
        throw new Error(`Failed to update job ${job.id}: ${updateError.message}`);
      }
      console.log(`[SUCCESS] Job ${job.id} updated successfully in the database.`);
      
      // --- 9. Update meetings table with transcript ---
      // Note: Status remains 'recording_scheduled' - transcript completion doesn't change status
      console.log(`[LOG] Saving transcript to meetings table...`);
      const { error: transcriptUpdateError } = await supabaseClient
        .from('meetings')
        .update({ 
          transcript: fullText
          // Status remains 'recording_scheduled' - meeting is complete with transcript
          // We don't update status here to maintain consistency with our status constraint
        })
        .eq('recall_bot_id', botIdFromPayload);
        
      if (transcriptUpdateError) {
        console.error(`Failed to save transcript to meetings: ${transcriptUpdateError.message}`);
        throw new Error(`Failed to save transcript to meetings: ${transcriptUpdateError.message}`);
      }
      console.log(`[SUCCESS] Transcript saved to meetings table.`);
      
      // --- 10. Trigger Recall.ai cleanup if transcript is valid ---
      if (isTranscriptValid) {
        console.log(`[LOG] Transcript verified. Triggering Recall.ai media cleanup...`);
        try {
          await supabaseClient.functions.invoke('cleanup-meeting-data', {
            body: {
              record: {
                meeting_id: meeting.google_event_id,
                recall_bot_id: botIdFromPayload
              }
            }
          });
          console.log(`[SUCCESS] Cleanup triggered successfully for meeting ${meeting.google_event_id}`);
        } catch (cleanupError) {
          // Best-effort: log but don't fail the webhook
          console.error(`[WARNING] Failed to trigger cleanup for meeting ${meeting.google_event_id}:`, cleanupError);
          console.error(`[WARNING] Transcript is saved, but Recall media may still exist. Manual cleanup may be needed.`);
        }
      }
    }
    
    console.log("[END] Process complete. Returning 200 OK.");
    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error) {
    console.error('Error in process-transcript webhook:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
});