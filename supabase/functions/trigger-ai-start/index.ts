import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse the incoming webhook payload
    const payload = await req.json();
    console.log("Received webhook payload:", JSON.stringify(payload, null, 2));

    // Extract record from payload
    const record = payload?.record;
    
    // Validate required fields
    if (!record) {
      return new Response(
        JSON.stringify({ 
          error: "Missing 'record' in payload",
          details: "Webhook payload must contain a 'record' object"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        }
      );
    }

    if (!record.thread_id) {
      return new Response(
        JSON.stringify({ 
          error: "Missing 'thread_id' in record",
          details: "The record object must contain a 'thread_id' field"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        }
      );
    }

    if (!record.user_id) {
      return new Response(
        JSON.stringify({ 
          error: "Missing 'user_id' in record",
          details: "The record object must contain a 'user_id' field"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        }
      );
    }

    // Get environment variables
    const TRIGGER_API_KEY = Deno.env.get("TRIGGER_API_KEY");
    const TRIGGER_PROJECT_ID = Deno.env.get("TRIGGER_PROJECT_ID");

    if (!TRIGGER_API_KEY) {
      console.error("Missing TRIGGER_API_KEY environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing TRIGGER_API_KEY environment variable",
          details: "The TRIGGER_API_KEY must be set in Supabase Edge Function secrets"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        }
      );
    }

    if (!TRIGGER_PROJECT_ID) {
      console.error("Missing TRIGGER_PROJECT_ID environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing TRIGGER_PROJECT_ID environment variable",
          details: "The TRIGGER_PROJECT_ID must be set in Supabase Edge Function secrets"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        }
      );
    }

    // Construct Trigger.dev V3 API URL (via HTTP v1 endpoint)
    const triggerUrl = `https://api.trigger.dev/api/v1/tasks/analyze-thread/trigger`;

    // Prepare the request payload
    const triggerPayload = {
      payload: {
        userId: record.user_id,
        threadId: record.thread_id
      },
      concurrencyKey: record.user_id
    };

    console.log(`Triggering analyze-thread task for thread ${record.thread_id} (user: ${record.user_id})`);

    // Call Trigger.dev API
    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TRIGGER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(triggerPayload)
    });

    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Trigger.dev API error (${response.status}):`, errorText);
      
      return new Response(
        JSON.stringify({ 
          error: "Failed to trigger Trigger.dev task",
          details: errorText,
          status: response.status
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status
        }
      );
    }

    // Parse successful response
    const responseData = await response.json().catch(() => ({}));
    
    console.log(`Successfully triggered analyze-thread task for thread ${record.thread_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Task triggered successfully",
        threadId: record.thread_id,
        userId: record.user_id,
        triggerResponse: responseData
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});

