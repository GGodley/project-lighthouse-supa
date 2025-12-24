// Secure proxy to fetch Gmail threads using access tokens from database
// Fetches tokens from google_tokens table (service role bypasses RLS)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
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
    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Validate Authorization header (BROKER_SHARED_SECRET)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const brokerSecret = Deno.env.get("BROKER_SHARED_SECRET");
    if (!brokerSecret) {
      return new Response(
        JSON.stringify({ error: "BROKER_SHARED_SECRET not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== brokerSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { userId, pageToken, lastSyncedAt } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
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
      return new Response(
        JSON.stringify({ 
          error: "missing_google_token",
          message: "Google access token not found. Please reconnect your Google account."
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional expiry check (if expires_at is set and expired, return error early)
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ 
            error: "token_expired",
            message: "Google access token has expired. Please reconnect your Google account."
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ 
            error: "gmail_unauthorized",
            message: "Gmail authentication failed. Token may have expired."
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (gmailResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: "gmail_forbidden",
            message: "Gmail access forbidden. Required scopes may be missing."
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Gmail API request failed", details: "[REDACTED]" }),
        { status: gmailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gmailData: GmailThreadsResponse = await gmailResponse.json();

    // Step 4: Return Sanitized Data (NO tokens in response)
    const response = {
      threads: gmailData.threads || [],
      nextPageToken: gmailData.nextPageToken || null,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Unexpected error in fetch-gmail-batch:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

