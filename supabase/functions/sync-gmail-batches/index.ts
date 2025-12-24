// Decoupled Gmail Batch Fetcher
// Accepts provider_token from user session, fetches batches, stores raw data, returns immediately
// No refresh token storage needed - uses session token directly

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface RequestBody {
  provider_token: string; // Google access token from user session
  userId: string;
  pageToken?: string;
  maxBatches?: number; // Optional: limit number of batches to fetch in this call
}

interface GmailThreadsResponse {
  threads?: Array<{ id: string; [key: string]: unknown }>;
  nextPageToken?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body: RequestBody = await req.json();
    const { provider_token, userId, pageToken, maxBatches = 10 } = body;

    if (!provider_token || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing provider_token or userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create sync state
    const { data: userState } = await supabaseAdmin
      .from("user_sync_states")
      .select("next_page_token, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle();

    let currentPageToken = pageToken || userState?.next_page_token || null;
    let batchesFetched = 0;
    let totalThreadsFetched = 0;

    // Fetch batches and store raw data
    while (batchesFetched < maxBatches) {
      // Build Gmail API URL
      let gmailUrl = "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=50";
      if (currentPageToken) {
        gmailUrl += `&pageToken=${encodeURIComponent(currentPageToken)}`;
      }

      // Fetch from Gmail API
      const gmailResponse = await fetch(gmailUrl, {
        headers: {
          Authorization: `Bearer ${provider_token}`,
        },
      });

      if (!gmailResponse.ok) {
        const errorText = await gmailResponse.text();
        console.error("Gmail API error:", errorText);
        
        if (gmailResponse.status === 401) {
          return new Response(
            JSON.stringify({ 
              error: "Gmail API authentication failed",
              message: "Token may have expired. Please re-authenticate."
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gmail API request failed", details: errorText }),
          { status: gmailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const gmailData: GmailThreadsResponse = await gmailResponse.json();
      const threads = gmailData.threads || [];
      const nextPageToken = gmailData.nextPageToken || null;

      if (threads.length === 0) {
        console.log("No more threads to fetch");
        break;
      }

      // Store raw thread data in database
      // Use upsert to handle duplicates gracefully
      const threadInserts = threads.map((thread: any) => ({
        thread_id: thread.id,
        user_id: userId,
        raw_thread_data: thread, // Store entire thread object as JSONB
        last_message_date: null, // Will be extracted during processing
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("threads")
        .upsert(threadInserts, {
          onConflict: "thread_id",
          ignoreDuplicates: false, // Update if exists
        });

      if (upsertError) {
        console.error("Error upserting threads:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to store threads", details: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      totalThreadsFetched += threads.length;
      batchesFetched++;

      // Update sync state
      await supabaseAdmin
        .from("user_sync_states")
        .upsert({
          user_id: userId,
          next_page_token: nextPageToken,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      // If no next page token, we're done
      if (!nextPageToken) {
        console.log("Reached end of pagination");
        break;
      }

      currentPageToken = nextPageToken;
    }

    // Return immediately - don't wait for processing
    return new Response(
      JSON.stringify({
        success: true,
        batchesFetched,
        totalThreadsFetched,
        nextPageToken: currentPageToken,
        message: "Batches fetched and stored. Processing will happen asynchronously.",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in sync-gmail-batches:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

