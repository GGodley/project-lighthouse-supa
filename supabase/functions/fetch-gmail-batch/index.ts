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

    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:81',message:'Starting token retrieval',data:{userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Step 1: Try to get gmail_access_token from profiles table first (new architecture)
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:85',message:'Checking profiles table for gmail_access_token',data:{userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('gmail_access_token')
      .eq('id', userId)
      .maybeSingle();

    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:92',message:'Profile query result',data:{hasProfile:!!profileData,hasAccessToken:!!profileData?.gmail_access_token,profileError:profileError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // If we have gmail_access_token from profiles, use it directly (no refresh token needed)
    if (profileData?.gmail_access_token) {
      // #region agent log
      await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:97',message:'Using gmail_access_token from profiles table',data:{hasToken:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const accessToken = profileData.gmail_access_token;
      
      // Skip to Step 3: Fetch Gmail Threads directly
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
    }

    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:163',message:'No gmail_access_token in profiles, falling back to refresh token method',data:{hasProfile:!!profileData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Fallback: Get Refresh Token using Admin API (old method)
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

    // Debug: Log identity data structure to understand what's available
    console.log("Google identity data keys:", Object.keys(googleIdentity.identity_data || {}));
    console.log("User app_metadata keys:", Object.keys(userData.user.app_metadata || {}));
    console.log("User user_metadata keys:", Object.keys(userData.user.user_metadata || {}));

    // Try multiple locations for refresh token
    let refreshToken: string | undefined = undefined;
    
    // Location 1: identity_data.provider_refresh_token (standard location)
    refreshToken = googleIdentity.identity_data?.provider_refresh_token as string | undefined;
    
    // Location 2: Check if it's stored directly in identity_data as "refresh_token"
    if (!refreshToken) {
      refreshToken = googleIdentity.identity_data?.refresh_token as string | undefined;
    }
    
    // Location 3: Check user app_metadata
    if (!refreshToken && userData.user.app_metadata) {
      refreshToken = userData.user.app_metadata.provider_refresh_token as string | undefined;
      if (!refreshToken) {
        refreshToken = userData.user.app_metadata.google_refresh_token as string | undefined;
      }
    }
    
    // Location 4: Check user user_metadata
    if (!refreshToken && userData.user.user_metadata) {
      refreshToken = userData.user.user_metadata.provider_refresh_token as string | undefined;
      if (!refreshToken) {
        refreshToken = userData.user.user_metadata.google_refresh_token as string | undefined;
      }
    }

    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:241',message:'Refresh token check result',data:{hasRefreshToken:!!refreshToken,hasIdentity:!!googleIdentity,identityDataKeys:Object.keys(googleIdentity.identity_data || {}),hasAppMetadata:!!userData.user.app_metadata,appMetadataKeys:Object.keys(userData.user.app_metadata || {})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!refreshToken) {
      // Provide detailed error with available data structure info
      const errorDetails = {
        error: "Google Refresh Token not found",
        message: "User needs to sign in with access_type=offline and prompt=consent to obtain a refresh token.",
        debug: {
          hasIdentity: !!googleIdentity,
          identityDataKeys: Object.keys(googleIdentity.identity_data || {}),
          hasAppMetadata: !!userData.user.app_metadata,
          appMetadataKeys: Object.keys(userData.user.app_metadata || {}),
        }
      };
      
      console.error("Refresh token not found:", JSON.stringify(errorDetails, null, 2));
      
      // #region agent log
      await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:256',message:'Returning refresh token error',data:{errorDetails},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      return new Response(
        JSON.stringify(errorDetails),
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

