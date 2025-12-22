// Secure proxy to fetch Gmail threads without exposing credentials
// Uses Admin API to retrieve refresh tokens and refreshes access tokens server-side

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

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
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
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    if (!googleClientId || !googleClientSecret) {
      return new Response(
        JSON.stringify({ error: "Missing Google OAuth environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

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

    // Step 1: Get Refresh Token using Admin API
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: `User not found: ${userError?.message || 'Unknown error'}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Find Google identity
    const googleIdentity = userData.user.identities?.find(
      (identity) => identity.provider === 'google'
    );

    if (!googleIdentity) {
      return new Response(
        JSON.stringify({ error: "Google identity not found for user" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Extract refresh token from identity_data
    const refreshToken = googleIdentity.identity_data?.provider_refresh_token as string | undefined;

    if (!refreshToken) {
      return new Response(
        JSON.stringify({ 
          error: "Google Refresh Token not found. User needs to sign in with access_type=offline." 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Step 2: Exchange Refresh Token for Access Token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token refresh failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to refresh access token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token in refresh response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Step 3: Fetch Gmail Threads
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
      console.error("Gmail API error:", errorText);
      
      // Handle specific error codes
      if (gmailResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Gmail API authentication failed" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
      
      if (gmailResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: "Gmail API access forbidden" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({ error: "Gmail API request failed" }),
        {
          status: gmailResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
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

