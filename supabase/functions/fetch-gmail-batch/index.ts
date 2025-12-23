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
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:163',message:'No gmail_access_token in profiles, checking for gmail_refresh_token',data:{hasProfile:!!profileData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Fallback: Check for gmail_refresh_token in profiles table and refresh access token
    const { data: refreshProfileData, error: refreshProfileError } = await supabaseAdmin
      .from('profiles')
      .select('gmail_refresh_token')
      .eq('id', userId)
      .maybeSingle();

    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:172',message:'Refresh token check result',data:{hasRefreshToken:!!refreshProfileData?.gmail_refresh_token,hasProfile:!!refreshProfileData,refreshProfileError:refreshProfileError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!refreshProfileData?.gmail_refresh_token) {
      // No access token and no refresh token in profiles - user needs to re-authenticate
      const errorDetails = {
        error: "Google tokens not found in profiles",
        message: "User needs to re-authenticate with Google. No gmail_access_token or gmail_refresh_token found in profiles table.",
      };
      
      console.error("Tokens not found in profiles:", errorDetails);
      
      // #region agent log
      await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:183',message:'Returning token not found error',data:{errorDetails},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      return new Response(
        JSON.stringify(errorDetails),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const refreshToken = refreshProfileData.gmail_refresh_token;

    // Step 2: Exchange Refresh Token for Access Token
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:203',message:'Refreshing access token using gmail_refresh_token from profiles',data:{hasRefreshToken:!!refreshToken},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
      
      // #region agent log
      await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:220',message:'Token refresh failed',data:{status:tokenResponse.status,errorText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
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

    // Update profiles table with the new access token
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fetch-gmail-batch/index.ts:240',message:'Updating profiles table with new access token',data:{hasAccessToken:!!accessToken},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    await supabaseAdmin
      .from('profiles')
      .update({ gmail_access_token: accessToken })
      .eq('id', userId);

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

