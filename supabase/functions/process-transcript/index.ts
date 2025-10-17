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
      
      // Update meeting status to 'processing'
      console.log(`[LOG] Updating meeting status to 'processing'`);
      const { error: processingUpdateError } = await supabaseClient
        .from('meetings')
        .update({ status: 'processing' })
        .eq('recall_bot_id', botIdFromPayload);
        
      if (processingUpdateError) {
        console.error(`Failed to update meeting status to processing: ${processingUpdateError.message}`);
        throw new Error(`Failed to update meeting status: ${processingUpdateError.message}`);
      }
      console.log(`[LOG] Meeting status updated to 'processing'`);
      
      // Now fetch the transcription job using the meeting's google_event_id
      const { data: job, error: fetchError } = await supabaseClient
        .from('transcription_jobs')
        .select('id, status')
        .eq('meeting_id', meeting.google_event_id)
        .maybeSingle();

      if (fetchError) {
        console.error(`Database fetch error: ${fetchError.message}`);
        throw new Error(`Database fetch error: ${fetchError.message}`);
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
      
      // --- 7. Final Database Update ---
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
      
      // Final update: set meeting status to 'done'
      console.log(`[LOG] Updating meeting status to 'done'`);
      const { error: doneUpdateError } = await supabaseClient
        .from('meetings')
        .update({ status: 'done' })
        .eq('recall_bot_id', botIdFromPayload);
        
      if (doneUpdateError) {
        console.error(`Failed to update meeting status to done: ${doneUpdateError.message}`);
        throw new Error(`Failed to update meeting status to done: ${doneUpdateError.message}`);
      }
      console.log(`[LOG] Meeting status updated to 'done'`);

      // Update transcription_jobs status to 'awaiting_summary'
      console.log(`[LOG] Updating transcription_jobs status to 'awaiting_summary'`);
      const { error: jobCompleteError } = await supabaseClient
        .from('transcription_jobs')
        .update({ status: 'awaiting_summary' })
        .eq('id', job.id);
        
      if (jobCompleteError) {
        console.error(`Failed to update transcription_jobs status to awaiting_summary: ${jobCompleteError.message}`);
        throw new Error(`Failed to update transcription_jobs status: ${jobCompleteError.message}`);
      }
      console.log(`[LOG] Transcription job status updated to 'awaiting_summary'`);
    }
    
    console.log("[END] Process complete. Returning 200 OK.");
    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error) {
    console.error('Error in process-transcript webhook:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
});