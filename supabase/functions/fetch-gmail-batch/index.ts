// Secure proxy to fetch Gmail threads without exposing credentials
// PRODUCTION-READY: Reads tokens from secure vault (auth.identities) via Admin API
// Does NOT store tokens in public.profiles to avoid RLS security risks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface RequestBody {
  userId?: string; // Required when using service role key (Trigger.dev), optional when using user session token (SSR)
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
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

    // Initialize Supabase clients
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Get the User ID from the Authorization Header (SSR Pattern)
    // Support both: user session token (SSR) or service role key + userId in body (Trigger.dev)
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

    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    let pageToken: string | undefined;
    let lastSyncedAt: string | undefined;

    // Parse request body first (can only be read once)
    const body = await req.json();
    pageToken = body.pageToken;
    lastSyncedAt = body.lastSyncedAt;

    // Try to get user from session token (SSR pattern)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (user && !userError) {
      // User session token provided - use SSR pattern
      userId = user.id;
    } else if (token === supabaseServiceKey) {
      // Service role key provided - get userId from body (for Trigger.dev)
      if (!body.userId) {
        return new Response(
          JSON.stringify({ error: "Missing userId in request body when using service role key" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
      userId = body.userId;
    } else {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // 2. SECURELY fetch the token from the system table (auth.identities)
    // Note: We use the 'supabaseAdmin' client (service_role) for this,
    // because normal users cannot read the auth.identities table.
    const { data: userData, error: identityError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (identityError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
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
        JSON.stringify({ error: "Google identity not found. Please connect your Google account." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Get refresh token from identity_data (secure vault)
    const refreshToken = googleIdentity.identity_data?.provider_refresh_token as string | undefined;

    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: "Google Refresh Token not found. Please reconnect Gmail." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // 3. Use the refreshToken to get a fresh access token from Google
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
        JSON.stringify({ error: "Failed to refresh access token. Please reconnect Gmail." }),
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

