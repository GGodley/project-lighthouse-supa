// Secure proxy to fetch Gmail threads using encrypted access tokens
// Receives encrypted access tokens from Trigger.dev and decrypts them for Gmail API calls

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface RequestBody {
  userId: string;
  encryptedAccessToken: string;
  pageToken?: string;
  lastSyncedAt?: string;
}

/**
 * Derives a 32-byte encryption key from the SUPABASE_SERVICE_ROLE_KEY using SHA-256.
 * This provides a deterministic, secure key for AES-GCM encryption/decryption.
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  }

  // Hash the secret with SHA-256 to get a 32-byte key
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);

  // Import the hashed key as a CryptoKey for AES-GCM
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Converts a hex string to an ArrayBuffer.
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Decrypts a token that was encrypted using AES-GCM encryption.
 * Matches the logic from src/utils/crypto.ts but uses Deno-compatible syntax.
 * 
 * @param text - The encrypted text in format "iv:encryptedText" (hex-encoded)
 * @returns The decrypted string
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set, input format is invalid, or decryption fails
 */
async function decryptToken(text: string): Promise<string> {
  try {
    // Parse the input to extract IV and encrypted data
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format: expected "iv:encryptedText"');
    }
    
    const [ivHex, encryptedHex] = parts;
    
    // Convert hex strings back to ArrayBuffers
    const iv = hexToArrayBuffer(ivHex);
    const encrypted = hexToArrayBuffer(encryptedHex);
    
    // Validate IV length (should be 12 bytes = 24 hex characters)
    if (iv.byteLength !== 12) {
      throw new Error('Invalid IV length: expected 12 bytes');
    }
    
    const key = await deriveKey();
    
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      key,
      encrypted
    );
    
    // Convert decrypted data back to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed: Unknown error');
  }
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

    // Validate Authorization header
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
    if (token !== supabaseServiceKey) {
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
    const { userId, encryptedAccessToken, pageToken, lastSyncedAt } = body;

    if (!userId || !encryptedAccessToken) {
      return new Response(
        JSON.stringify({ error: "Missing userId or encryptedAccessToken in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Decrypt the access token
    let accessToken: string;
    try {
      accessToken = await decryptToken(encryptedAccessToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({ error: `Failed to decrypt access token: ${errorMessage}` }),
        {
          status: 400,
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

