// Secure proxy to fetch Gmail threads using access tokens from database
// Fetches tokens from google_tokens table (service role bypasses RLS)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-broker-secret'
};

interface RequestBody {
  userId: string;
  pageToken?: string;
  lastSyncedAt?: string;
}

interface GmailThreadsResponse {
  threads?: Array<{ id: string; [key: string]: unknown }>;
  nextPageToken?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Safe header debugging (only prefixes, never full secrets)
    const brokerSecretHeader = req.headers.get("x-broker-secret") || "";
    const apikey = req.headers.get("apikey") || "";
    
    console.log("[BROKER] header debug", {
      hasBrokerSecret: !!brokerSecretHeader,
      brokerSecretPrefix: brokerSecretHeader.slice(0, 8),
      hasApikey: !!apikey,
      apikeyPrefix: apikey.slice(0, 8),
    });

    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      const res = new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
        }
      );
      return res;
    }

    // Validate X-Broker-Secret header (BROKER_SHARED_SECRET)
    // Use custom header instead of Authorization to avoid Supabase JWT parsing conflicts
    const brokerSecret = Deno.env.get("BROKER_SHARED_SECRET");
    if (!brokerSecret) {
      const res = new Response(
        JSON.stringify({ error: "BROKER_SHARED_SECRET not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
        }
      );
      return res;
    }

    const providedSecret = req.headers.get("x-broker-secret");
    if (!providedSecret || providedSecret !== brokerSecret) {
      const res = new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
        }
      );
      return res;
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { userId, pageToken, lastSyncedAt } = body;

    if (!userId) {
      const res = new Response(
        JSON.stringify({ error: "Missing userId in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
        }
      );
      return res;
    }

    // Create Supabase admin client to fetch token from google_tokens table
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Fetch token from google_tokens table
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('google_tokens')
      .select('access_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (tokenError || !tokenData?.access_token) {
      const res = new Response(
        JSON.stringify({ 
          error: "missing_google_token",
          message: "Google access token not found. Please reconnect your Google account."
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" } }
      );
      return res;
    }

    // Optional expiry check (if expires_at is set and expired, return error early)
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt < new Date()) {
        const res = new Response(
          JSON.stringify({ 
            error: "token_expired",
            message: "Google access token has expired. Please reconnect your Google account."
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" } }
        );
        return res;
      }
    }

    const accessToken = tokenData.access_token;

    // 4. Fetch Gmail Threads using the access token
    let gmailUrl = "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=50";

    // Add pagination token if provided
    if (pageToken) {
      gmailUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    // Add time-based filter if lastSyncedAt is provided
    if (lastSyncedAt) {
      try {
        const lastSyncedDate = new Date(lastSyncedAt);
        const unixTimestamp = Math.floor(lastSyncedDate.getTime() / 1000);
        gmailUrl += `&q=${encodeURIComponent(`after:${unixTimestamp}`)}`;
      } catch (e) {
        console.warn("Invalid lastSyncedAt format, ignoring:", e);
      }
    }

    const gmailResponse = await fetch(gmailUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      console.error("Gmail API error: [REDACTED]");
      
      if (gmailResponse.status === 401) {
        const res = new Response(
          JSON.stringify({ 
            error: "gmail_unauthorized",
            message: "Gmail authentication failed. Token may have expired."
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" } }
        );
        return res;
      }
      
      if (gmailResponse.status === 403) {
        const res = new Response(
          JSON.stringify({ 
            error: "gmail_forbidden",
            message: "Gmail access forbidden. Required scopes may be missing."
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" } }
        );
        return res;
      }
      
      const res = new Response(
        JSON.stringify({ error: "Gmail API request failed", details: "[REDACTED]" }),
        { status: gmailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" } }
      );
      return res;
    }

    const gmailData: GmailThreadsResponse = await gmailResponse.json();

    // Step 4: Return Sanitized Data (NO tokens in response)
    const response = {
      threads: gmailData.threads || [],
      nextPageToken: gmailData.nextPageToken || null,
    };

    const res = new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
      }
    );
    return res;

  } catch (error) {
    console.error("Unexpected error in fetch-gmail-batch:", error);
    const res = new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Gmail-Batch-Version": "BROKER_AUTH_V3" }
      }
    );
    return res;
  }
});

