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
      console.log(`[LOG] Searching for job with recall_bot_id: ${botIdFromPayload}`);
      const { data: job, error: fetchError } = await supabaseClient
        .from('transcription_jobs')
        .select('id, status')
        .eq('recall_bot_id', botIdFromPayload)
        .single();

      if (fetchError) throw new Error(`Database fetch error: ${fetchError.message}`);
      if (!job) throw new Error(`No job found for bot_id: ${botIdFromPayload}`);
      console.log(`[LOG] Found job ${job.id} with status: '${job.status}'`);

      // --- 4. Idempotency Check ---
      if (job.status !== 'processing') {
        console.log(`[LOG] Idempotency check failed. Job status is not 'processing'. Exiting successfully.`);
        return new Response("OK (already processed)", { status: 200 });
      }
      console.log("[LOG] Idempotency check passed.");

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
    }
    
    console.log("[END] Process complete. Returning 200 OK.");
    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error) {
    console.error('Error in process-transcript webhook:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
});