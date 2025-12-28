// Secure proxy to fetch Google Calendar events using access tokens from database
// Fetches tokens from google_tokens table (service role bypasses RLS)
// Pattern: Follows fetch-gmail-batch/index.ts exactly

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-client-info, apikey, content-type, x-broker-secret'
};

interface RequestBody {
  userId: string;
  calendarId?: string;
  pageToken?: string;
  timeMin?: string;
  timeMax?: string;
}

interface CalendarListResponse {
  items?: Array<{ id: string; summary?: string; [key: string]: unknown }>;
}

interface CalendarEventsResponse {
  items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; attendees?: Array<{ email: string; responseStatus?: string }>; [key: string]: unknown }>;
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
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
        }
      );
      return res;
    }

    // Validate X-Broker-Secret header (BROKER_SHARED_SECRET)
    const brokerSecret = Deno.env.get("BROKER_SHARED_SECRET");
    if (!brokerSecret) {
      const res = new Response(
        JSON.stringify({ error: "BROKER_SHARED_SECRET not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
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
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
        }
      );
      return res;
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { userId, calendarId, pageToken, timeMin, timeMax } = body;

    if (!userId) {
      const res = new Response(
        JSON.stringify({ error: "Missing userId in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
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
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
      );
      return res;
    }

    // Optional expiry check
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt < new Date()) {
        const res = new Response(
          JSON.stringify({ 
            error: "calendar_unauthorized",
            message: "Google token expired. Please reconnect your Google account."
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
        );
        return res;
      }
    }

    const accessToken = tokenData.access_token;

    // If calendarId provided, fetch events for that calendar
    if (calendarId) {
      // Calculate default time range (2 weeks) if not provided
      const now = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      
      const finalTimeMin = timeMin || now.toISOString();
      const finalTimeMax = timeMax || twoWeeksFromNow.toISOString();

      const encodedCalendarId = encodeURIComponent(calendarId);
      let eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?timeMin=${encodeURIComponent(finalTimeMin)}&timeMax=${encodeURIComponent(finalTimeMax)}&singleEvents=true&orderBy=startTime&maxResults=2500`;
      
      if (pageToken) {
        eventsUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const eventsResponse = await fetch(eventsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        console.error("Google Calendar API error: [REDACTED]");
        
        if (eventsResponse.status === 401) {
          const res = new Response(
            JSON.stringify({ 
              error: "calendar_unauthorized",
              message: "Google Calendar authentication failed. Token may have expired."
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
          );
          return res;
        }
        
        const res = new Response(
          JSON.stringify({ error: "Google Calendar API request failed", details: "[REDACTED]" }),
          { status: eventsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
        );
        return res;
      }

      const eventsData: CalendarEventsResponse = await eventsResponse.json();

      const res = new Response(
        JSON.stringify({
          events: eventsData.items || [],
          nextPageToken: eventsData.nextPageToken || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
        }
      );
      return res;
    } else {
      // No calendarId provided - fetch calendar list
      const calendarListUrl = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
      
      const calendarListResponse = await fetch(calendarListUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!calendarListResponse.ok) {
        const errorText = await calendarListResponse.text();
        console.error("Google Calendar List API error: [REDACTED]");
        
        if (calendarListResponse.status === 401) {
          const res = new Response(
            JSON.stringify({ 
              error: "calendar_unauthorized",
              message: "Google Calendar authentication failed. Token may have expired."
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
          );
          return res;
        }
        
        const res = new Response(
          JSON.stringify({ error: "Google Calendar List API request failed", details: "[REDACTED]" }),
          { status: calendarListResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" } }
        );
        return res;
      }

      const calendarListData: CalendarListResponse = await calendarListResponse.json();

      const res = new Response(
        JSON.stringify({
          calendars: calendarListData.items || [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
        }
      );
      return res;
    }

  } catch (error) {
    console.error("Unexpected error in fetch-calendar-events:", error);
    const res = new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Fetch-Calendar-Events-Version": "BROKER_AUTH_V1" }
      }
    );
    return res;
  }
});

