//
// ⚠️ THIS IS THE CORRECTED AND ROBUST sync-emails EDGE FUNCTION ⚠️
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Helper Functions to Correctly Parse Gmail's Complex Payload ---

const decodeBase64Url = (data: string | undefined): string | undefined => {
  if (!data) return undefined;
  try {
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return atob(base64);
  } catch (e) {
    console.error("Base64 decoding failed for data chunk.", e);
    return undefined;
  }
};

const collectBodies = (payload: any): { text?: string; html?: string } => {
  let text: string | undefined;
  let html: string | undefined;
  const partsToVisit = [payload, ...(payload?.parts || [])];
  
  const findParts = (parts: any[]) => {
    for (const part of parts) {
      if (part?.body?.data) {
        const mimeType = part.mimeType || '';
        const decodedData = decodeBase64Url(part.body.data);
        if (decodedData) {
          if (mimeType === 'text/plain' && !text) {
            text = decodedData;
          }
          if (mimeType === 'text/html' && !html) {
            html = decodedData;
          }
        }
      }
      if (part?.parts) {
        findParts(part.parts);
      }
    }
  };

  findParts(partsToVisit);
  return { text, html };
};

// --- Main Serve Function ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- START DIAGNOSTIC LOGS ---
    console.log("--- [sync-emails] DIAGNOSTIC START ---");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("Attempting to read SUPABASE_SERVICE_ROLE_KEY...");
    console.log("Value found:", serviceKey ? `...${serviceKey.slice(-6)}` : "!!! KEY NOT FOUND !!!");
    console.log("--- [sync-emails] DIAGNOSTIC END ---");
    // --- END DIAGNOSTIC LOGS ---

    const { jobId, provider_token, pageToken } = await req.json();
    
    if (!jobId || !provider_token) {
      throw new Error("Missing jobId or provider_token in request body.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (!pageToken) {
      await supabaseAdmin.from('sync_jobs').update({ status: 'running', details: 'Starting email sync...' }).eq('id', jobId);
    }

    const { data: jobData, error: jobFetchError } = await supabaseAdmin.from('sync_jobs').select('user_id').eq('id', jobId).single();
    if (jobFetchError || !jobData) throw new Error(`Could not fetch job details for job ID: ${jobId}`);
    const userId = jobData.user_id;

    // 1. Get a list of email IDs
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const query = `after:${Math.floor(ninetyDaysAgo.getTime() / 1000)}`;
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
    if (pageToken) {
      listUrl += `&pageToken=${pageToken}`;
    }
    const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${provider_token}` } });
    if (!listResp.ok) {
        throw new Error(`Gmail API list request failed: ${await listResp.text()}`);
    }
    const listJson = await listResp.json();
    const messageIds = listJson.messages?.map((m: any) => m.id).filter(Boolean) || [];

    let emailsToStore = [];
    if (messageIds.length > 0) {
      // (The batching logic using Gmail Batch API is complex and less readable,
      // let's revert to a slightly slower but more robust individual fetch for easier debugging)
      for (const msgId of messageIds) {
          const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
            headers: { Authorization: `Bearer ${provider_token}` }
          });
          if (!msgResp.ok) {
              console.warn(`Failed to fetch details for message ${msgId}. Skipping.`);
              continue;
          }
          const msgJson = await msgResp.json();
          const headers = msgJson?.payload?.headers || [];
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
          
          // ✅ FIX: Use the robust helper function to get email bodies
          const bodies = collectBodies(msgJson.payload);
          
          emailsToStore.push({
              user_id: userId,
              gmail_message_id: msgJson.id,
              subject: subject,
              sender: from,
              snippet: msgJson.snippet,
              body_text: bodies.text, // ✅ FIX: Save the text body
              body_html: bodies.html, // ✅ FIX: Save the HTML body
              received_at: new Date(Number(msgJson.internalDate)).toISOString(),
          });
      }
    }

    // Use upsert to avoid duplicates
    if (emailsToStore.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('emails')
        .upsert(emailsToStore, { onConflict: 'gmail_message_id' });
      if (upsertErr) {
        await supabaseAdmin.from('sync_jobs').update({ status: 'failed', details: `Database upsert error: ${upsertErr.message}` }).eq('id', jobId);
        throw upsertErr;
      }
    }

    // Chain to the next page or complete the job
    if (listJson.nextPageToken) {
      await supabaseAdmin.functions.invoke('sync-emails', {
        body: { jobId, provider_token, pageToken: listJson.nextPageToken },
      });
    } else {
      await supabaseAdmin.from('sync_jobs').update({ status: 'completed', details: 'All emails have been synced.' }).eq('id', jobId);
    }

    return new Response(JSON.stringify({ message: "Batch processed successfully." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    });

  } catch (error) {
    // Graceful error handling
    const reqBody = await req.json().catch(() => ({}));
    const jobId = reqBody.jobId;
    if (jobId) {
        await createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
            .from('sync_jobs').update({ status: 'failed', details: error.message }).eq('id', jobId);
    }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});