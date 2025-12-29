import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  viewMode: 'upcoming' | 'completed';
}

interface Meeting {
  id: number;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  meeting_url: string | null;
  duration_minutes: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Initialize Supabase client with user's authorization
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization") ?? "",
          },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Parse request body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid request body", message: "JSON parsing failed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const { viewMode } = body;

    // Validate viewMode
    if (viewMode !== 'upcoming' && viewMode !== 'completed') {
      return new Response(
        JSON.stringify({ error: "Invalid viewMode", message: "viewMode must be 'upcoming' or 'completed'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Build query based on viewMode
    let query = supabaseClient
      .from('meetings')
      .select('id, title, start_time, end_time, meeting_url')
      .eq('user_id', user.id);

    if (viewMode === 'upcoming') {
      query = query.gte('start_time', new Date().toISOString())
                   .order('start_time', { ascending: true });
    } else {
      query = query.lt('start_time', new Date().toISOString())
                   .order('start_time', { ascending: false });
    }

    const { data: meetings, error: queryError } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch meetings", details: queryError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Transform meetings to include duration_minutes
    const transformedMeetings: Meeting[] = (meetings || []).map((meeting) => {
      let durationMinutes = 0;
      
      if (meeting.start_time && meeting.end_time) {
        const start = new Date(meeting.start_time);
        const end = new Date(meeting.end_time);
        const diffMs = end.getTime() - start.getTime();
        durationMinutes = Math.round(diffMs / (1000 * 60));
      }

      return {
        id: meeting.id,
        title: meeting.title,
        start_time: meeting.start_time,
        end_time: meeting.end_time,
        meeting_url: meeting.meeting_url,
        duration_minutes: durationMinutes,
      };
    });

    // Return the transformed data
    return new Response(
      JSON.stringify({ meetings: transformedMeetings }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error('Unexpected error in fetch-meetings:', error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

