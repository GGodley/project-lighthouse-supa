import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Define the CORS headers that your function will return
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allows requests from any origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
  let currentStep = "init";
  // This new block handles the OPTIONS preflight request from the browser.
  // It's the primary fix for the CORS error.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200 
    });
  }

  // Only process POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    // Dynamic import of Supabase client
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    currentStep = "read-headers";
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing Authorization header");
    }
    const supabaseAccessToken = authHeader.replace("Bearer ", "");

    // Validate the Supabase JWT and get the user
    currentStep = "validate-user";
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser(supabaseAccessToken);
    if (userErr || !userData?.user) {
      throw new Error("User not authenticated.");
    }
    const userId = userData.user.id;

    // Read provider_token from request body (sent by frontend)
    currentStep = "read-body";
    const body = await req.json().catch(() => ({}));
    let providerToken = body?.provider_token as string | undefined;

    // Fallback: fetch session using the Authorization header and read provider_token
    if (!providerToken) {
      currentStep = "fallback-get-session";
      const supabaseWithAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: `Bearer ${supabaseAccessToken}` } } }
      );
      const { data: { session: srvSession }, error: sessionError } = await supabaseWithAuth.auth.getSession();
      
      console.log("Fallback session debug:", {
        hasSession: !!srvSession,
        hasProviderToken: !!srvSession?.provider_token,
        sessionError: sessionError?.message,
        sessionKeys: srvSession ? Object.keys(srvSession) : []
      });
      
      providerToken = srvSession?.provider_token as string | undefined;
    }

    if (!providerToken) {
      throw new Error("Google provider token not provided.");
    }

    // Create admin client for database operations (uses service role key)
    currentStep = "create-admin-client";
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Initialize Google API client
    // Fetch recent emails from Gmail via REST API using the provider access token
    currentStep = "gmail-list";
    console.log("Fetching emails from Gmail via REST...");
    const listResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!listResp.ok) {
      const body = await listResp.text();
      throw new Error(`Gmail list failed: ${listResp.status} ${body}`);
    }
    const listJson: any = await listResp.json();
    const messages = Array.isArray(listJson.messages) ? listJson.messages : [];
    console.log("Gmail list count:", messages.length);

    currentStep = "gmail-get-details";
    // Helpers to extract email data
    const extractEmailAddress = (fromHeader: string | undefined): string | undefined => {
      if (!fromHeader) return undefined;
      const match = fromHeader.match(/<([^>]+)>/);
      return (match ? match[1] : fromHeader).trim();
    };

    const decodeBase64Url = (data: string | undefined): string | undefined => {
      if (!data) return undefined;
      try {
        // Gmail uses base64url
        const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
        const padLen = (4 - (b64.length % 4)) % 4;
        const padded = b64 + '='.repeat(padLen);
        return atob(padded);
      } catch (_) {
        return undefined;
      }
    };

    const collectBodies = (payload: any): { text?: string; html?: string } => {
      let text: string | undefined;
      let html: string | undefined;

      const visit = (part: any) => {
        if (!part) return;
        const mime = part.mimeType || part.mime_type;
        if (part.body?.data) {
          const decoded = decodeBase64Url(part.body.data);
          if (mime === 'text/plain' && decoded && !text) text = decoded;
          if (mime === 'text/html' && decoded && !html) html = decoded;
        }
        if (Array.isArray(part.parts)) {
          for (const p of part.parts) visit(p);
        }
      };

      // Top level
      visit(payload);
      return { text, html };
    };

    const emailsToStore = await Promise.all(messages.map(async (msg: any) => {
      const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      if (!msgResp.ok) {
        const body = await msgResp.text();
        throw new Error(`Gmail get message failed: ${msgResp.status} ${body}`);
      }
      const msgJson: any = await msgResp.json();
      const headers: Array<{ name: string; value: string }> = msgJson?.payload?.headers ?? [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const senderHeader = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
      const senderEmailOnly = extractEmailAddress(senderHeader);
      const recipientHeader = headers.find(h => h.name === 'To')?.value;
      const recipientEmailOnly = extractEmailAddress(recipientHeader) || user.email || undefined;
      const internalDate = msgJson?.internalDate ? new Date(parseInt(msgJson.internalDate, 10)).toISOString() : null;

      // Lookup customer by contact_email == sender email
      let customerId: string | null = null;
      if (senderEmailOnly) {
        // 1) Try find existing customer by contact_email
        let { data: customer, error: findErr } = await supabaseAdmin
          .from('customers')
          .select('id')
          .eq('contact_email', senderEmailOnly)
          .maybeSingle();

        if (findErr) {
          console.warn('Customer lookup error:', findErr.message);
        }

        // 2) If not found, create a new customer using sender email as default name
        if (!customer) {
          console.log(`Creating new customer for sender: ${senderEmailOnly}`);
          const { data: newCustomer, error: insertErr } = await supabaseAdmin
            .from('customers')
            .insert({ contact_email: senderEmailOnly, name: senderEmailOnly })
            .select('id')
            .maybeSingle();

          if (insertErr) {
            console.warn('Customer create error:', insertErr.message);
          } else if (newCustomer?.id) {
            customer = newCustomer;
          }
        }

        if (customer?.id) customerId = customer.id;
      }

      const bodies = collectBodies(msgJson?.payload);
      return {
        user_id: userId,
        subject,
        sender: senderHeader,
        recipient: recipientEmailOnly ?? null,
        snippet: msgJson?.snippet ?? null,
        body_text: bodies.text ?? null,
        body_html: bodies.html ?? null,
        customer_id: customerId,
        received_at: internalDate,
      };
    }));

    // Save emails to the Supabase database using admin client
    currentStep = "db-upsert";
    console.log("Saving emails to database...", { count: emailsToStore.length });
    if (emailsToStore.length > 0) {
      const { error } = await supabaseAdmin.from('emails').upsert(emailsToStore);
      if (error) {
        console.error("Database error:", error);
        throw error;
      }
      console.log("Emails saved successfully");
    }

    return new Response(JSON.stringify({ message: `Synced ${emailsToStore.length} emails.` }), {
      // Add the CORS headers to your successful response
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const safeMessage = typeof error?.message === 'string' ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: safeMessage, step: currentStep }), {
      // Add the CORS headers to your error response
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});