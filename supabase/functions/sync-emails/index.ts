import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
    const userId = jobData.user_id as string;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const query = `after:${Math.floor(ninetyDaysAgo.getTime() / 1000)}`;

    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    const listResp = await fetch(url, { headers: { Authorization: `Bearer ${provider_token}` } });

    if (!listResp.ok) {
        const errorBody = await listResp.text();
        await supabaseAdmin.from('sync_jobs').update({ status: 'failed', details: `Gmail API Error: ${errorBody}` }).eq('id', jobId);
        throw new Error(`Gmail API list request failed: ${listResp.status} ${errorBody}`);
    }
    
    const listJson = await listResp.json();
    const messageIds: Array<{ id?: string }> = listJson.messages || [];

    let processedCount = 0;
    if (messageIds.length > 0) {
      // Update progress before processing this batch
      await supabaseAdmin
        .from('sync_jobs')
        .update({ details: `Processing batch of ${messageIds.length} messages...` })
        .eq('id', jobId);

      // Helper to fetch message details
      const fetchMessage = async (id: string) => {
        const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
          headers: { Authorization: `Bearer ${provider_token}` },
        });
        if (!msgResp.ok) {
          const body = await msgResp.text();
          throw new Error(`Gmail message get failed: ${msgResp.status} ${body}`);
        }
        return await msgResp.json();
      };

      // Extract a header helper
      const getHeader = (headers: Array<{ name?: string | null; value?: string | null }>, name: string) =>
        headers.find((h) => (h.name || '').toLowerCase() === name.toLowerCase())?.value || '';

      const rows: Array<{ user_id: string; subject: string; sender: string; snippet: string | null; received_at: string }>
        = [];

      for (const item of messageIds) {
        if (!item.id) continue;
        try {
          const msgJson = await fetchMessage(item.id);
          const headers = (msgJson?.payload?.headers as Array<{ name?: string; value?: string }> | undefined) || [];
          const subject = getHeader(headers, 'Subject');
          const from = getHeader(headers, 'From');
          const snippet: string | null = msgJson?.snippet ?? null;
          const internalDateStr = msgJson?.internalDate ?? '';
          const receivedAt = internalDateStr ? new Date(Number(internalDateStr)).toISOString() : new Date().toISOString();

          rows.push({
            user_id: userId,
            subject: subject || 'No Subject',
            sender: from || 'Unknown Sender',
            snippet,
            received_at: receivedAt,
          });
          processedCount++;
        } catch (e) {
          // Continue on individual message errors, but record progress
          await supabaseAdmin
            .from('sync_jobs')
            .update({ details: `Processed ${processedCount}/${messageIds.length} in this batch (some errors).` })
            .eq('id', jobId);
        }
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabaseAdmin.from('emails').insert(rows);
        if (insertErr) {
          await supabaseAdmin.from('sync_jobs').update({ status: 'failed', details: `Insert error: ${insertErr.message}` }).eq('id', jobId);
          throw insertErr;
        }
      }

      // Update progress after batch
      await supabaseAdmin
        .from('sync_jobs')
        .update({ details: `Batch stored: ${processedCount} messages.` })
        .eq('id', jobId);
    }

    if (listJson.nextPageToken) {
      await supabaseAdmin
        .from('sync_jobs')
        .update({ details: 'Fetching next page...' })
        .eq('id', jobId);

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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});