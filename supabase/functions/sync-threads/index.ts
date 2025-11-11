//
// 🚀 This is the NEW sync-threads Edge Function, adapted from sync-emails 🚀
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

// --- UNCHANGED ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});

// --- Utility Functions ---
// Sleep helper for retry delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// OpenAI API call wrapper with retry and backoff for rate limits
async function openAiCallWithBackoff<T>(
  apiCallFunction: () => Promise<T>,
  maxRetries: number = 5
): Promise<T> {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await apiCallFunction();
    } catch (error: any) {
      attempt++;
      
      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        console.error(`❌ OpenAI API call failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      // Check if it's a rate limit error (only retry if we haven't exhausted attempts)
      if (error?.code === 'rate_limit_exceeded') {
        console.warn(`⚠️ OpenAI rate limit hit (attempt ${attempt}/${maxRetries})`);
        
        // Try to get retry-after time from headers
        let retryAfterMs = 2000; // Default fallback
        
        if (error.headers?.['retry-after-ms']) {
          retryAfterMs = parseInt(error.headers['retry-after-ms'], 10);
        } else if (error.message) {
          // Try to parse from error message like "Please try again in 1.224s"
          const match = error.message.match(/try again in ([\d.]+)s/i);
          if (match) {
            retryAfterMs = Math.ceil(parseFloat(match[1]) * 1000);
          }
        }
        
        // Add 500ms buffer
        const waitTime = retryAfterMs + 500;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        
        // Continue loop to retry
        continue;
      }
      
      // For any other error, re-throw immediately
      throw error;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Max retries exhausted');
}

// --- UNCHANGED ---
// Helper Functions to Correctly Parse Gmail's Complex Payload
const decodeBase64Url = (data: string | undefined): string | undefined => {
  if (!data) return undefined;
  try {
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while(base64.length % 4){
      base64 += '=';
    }
    return atob(base64);
  } catch (e) {
    console.error("Base64 decoding failed for data chunk.", e);
    return undefined;
  }
};

// --- UNCHANGED ---
const collectBodies = (payload: any): { text?: string, html?: string } => {
  let text: string | undefined;
  let html: string | undefined;
  const partsToVisit = [payload, ...payload?.parts || []];
  const findParts = (parts: any[]) => {
    for (const part of parts){
      if (part?.body?.data) {
        const mimeType = part.mimeType || '';
        const decodedData = decodeBase64Url(part.body.data);
        if (decodedData) {
          if (mimeType === 'text/plain' && !text) {
            text = decodedData;
          }
          if (mimeType === 'text/html' && !html) {
            html = decodedData;
          }
        }
      }
      if (part?.parts) {
        findParts(part.parts);
      }
    }
  };
  findParts(partsToVisit);
  return { text, html };
};

// --- NEW ---
// LLM Summarization Functions (from Phase 3 of our plan)
// Note: This function formats payloads, not full messages, for summarization
const formatThreadForLLM = (messages: any[], csmEmail: string): string => {
  let script = "";
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader;
    const sentDate = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date(Number(msg.internalDate)).toISOString();

    const role = fromEmail.includes(csmEmail) ? "CSM" : "Customer";
    const bodies = collectBodies(msg.payload);
    
    script += `---
Role: ${role}
From: ${fromHeader}
Date: ${sentDate}

${bodies.text || '[No plain text body]'}
\n---
`;
  }
  return script;
};

// --- NEW ---
const estimateTokens = (text: string): number => {
  return text.split(/\s+/).length * 1.5; // Simple approximation
};

// --- NEW ---
// This function calls the OpenAI API and requests a structured JSON response
const processShortThread = async (script: string): Promise<any> => {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping summarization");
    return { "error": "OPENAI_API_KEY not configured" };
  }

  const systemPrompt = `You are a world-class Customer Success Manager (CSM) analyst. Analyze email threads and extract structured summaries.

Return a JSON object with the following structure:
{
  "problem_statement": "A clear statement of the problem or topic discussed",
  "key_participants": ["array", "of", "participant", "names"],
  "timeline_summary": "A summary of the timeline of events in the thread",
  "resolution_status": "Status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Customer sentiment (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {
      "text": "Action item description",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
- Only extract next steps that are EXPLICITLY mentioned in the conversation
- Do NOT create or infer next steps if they are not clearly stated
- If no next steps are mentioned, return an empty array []
- For owner: Extract the name or email of the person responsible. If not mentioned, use null
- For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
- Do not hallucinate or make up next steps

Sentiment Categories & Scores:
- "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
- "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
- "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
- "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
- "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

  const userQuery = `Email Thread:\n\n${script}\n\nPlease analyze this thread and return the JSON summary.`;

  try {
    // Wrap the API call with retry logic
    const apiCallFunction = async () => {
      return await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        response_format: { type: "json_object" }
      });
    };

    const completion = await openAiCallWithBackoff(apiCallFunction, 5);

    const responseContent = completion.choices[0]?.message?.content;
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from OpenAI:", completion);
      throw new Error("Invalid response from OpenAI.");
    }
  } catch (error) {
    console.error("Error in processShortThread:", error);
    // Re-throw the error so it can be caught by the main try-catch and mark job as failed
    throw error;
  }
};

// --- NEW ---
// This function handles long threads using the Map-Reduce pattern
const processLongThread = async (script: string): Promise<any> => {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping summarization");
    return { "error": "OPENAI_API_KEY not configured" };
  }
  
  // Task 3.6: Chunking
  // A simple chunking by message count (e.g., 15 messages per chunk)
  // This is safer than token-based chunking which might cut a message.
  const scriptChunks = script.split('\n---\n').filter(s => s.trim().length > 0);
  const CHUNK_SIZE = 15; // 15 messages per chunk
  const chunks: string[] = [];
  for (let i = 0; i < scriptChunks.length; i += CHUNK_SIZE) {
    chunks.push(scriptChunks.slice(i, i + CHUNK_SIZE).join('\n---\n'));
  }

  // Task 3.6: Map
  const chunkSummaries: string[] = [];
  const mapPrompt = "You are an email analyst. Concisely summarize the key events, questions, and outcomes from this *part* of an email thread. This is an intermediate step; do not create a final report. Just state the facts of this chunk.\n\nChunk:\n";

  for (const chunk of chunks) {
    try {
      // Wrap the API call with retry logic
      const apiCallFunction = async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: mapPrompt },
            { role: "user", content: chunk }
          ]
        });
      };

      const completion = await openAiCallWithBackoff(apiCallFunction, 5);
      
      const text = completion.choices[0]?.message?.content;
      if (text) chunkSummaries.push(text);
    } catch (error) {
      console.error("Error summarizing chunk:", error);
      // Re-throw error so it can be caught by main try-catch and mark job as failed
      throw error;
    }
  }

  // Task 3.6: Reduce
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");
  const reducePrompt = `You are a world-class Customer Success Manager (CSM) analyst. The following are intermediate summaries from a very long email thread. Combine them into a single, cohesive, final report.

Return a JSON object with the following structure:
{
  "problem_statement": "A clear statement of the problem or topic discussed",
  "key_participants": ["array", "of", "participant", "names"],
  "timeline_summary": "A summary of the timeline of events in the thread",
  "resolution_status": "Status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Customer sentiment (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {
      "text": "Action item description",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
- Only extract next steps that are EXPLICITLY mentioned in the conversation
- Do NOT create or infer next steps if they are not clearly stated
- If no next steps are mentioned, return an empty array []
- For owner: Extract the name or email of the person responsible. If not mentioned, use null
- For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
- Do not hallucinate or make up next steps

Sentiment Categories & Scores:
- "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
- "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
- "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
- "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
- "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues`;

  const reduceQuery = `Intermediate Summaries:\n\n${combinedSummaries}\n\nPlease analyze these summaries and generate the final JSON report.`;

  try {
    // Wrap the API call with retry logic
    const apiCallFunction = async () => {
      return await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: reducePrompt },
          { role: "user", content: reduceQuery }
        ],
        response_format: { type: "json_object" }
      });
    };

    const completion = await openAiCallWithBackoff(apiCallFunction, 5);

    const responseContent = completion.choices[0]?.message?.content;
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from OpenAI (reduce step):", completion);
      throw new Error("Invalid response from OpenAI.");
    }
  } catch (error) {
    console.error("Error in processLongThread reduce step:", error);
    // Re-throw the error so it can be caught by the main try-catch and mark job as failed
    throw error;
  }
};

// --- NEW ---
// Incremental summarization: Updates existing summary with new messages
const summarizeThreadIncremental = async (
  previousSummary: any,
  newMessages: any[],
  csmEmail: string
): Promise<any> => {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping summarization");
    return { "error": "OPENAI_API_KEY not configured" };
  }

  // Format only the new messages
  const newMessagesScript = formatThreadForLLM(newMessages, csmEmail);
  
  const systemPrompt = `You are a world-class Customer Success Manager (CSM) analyst. Your task is to update an existing email thread summary with new messages that have arrived.

You will receive:
1. The previous summary of the email thread (as a JSON object)
2. New messages that have been added to the thread

Your job is to:
- Integrate the new information from the new messages into the existing summary
- Update the timeline, sentiment, resolution status, and next steps based on the new messages
- Maintain continuity with the previous summary while incorporating the latest developments
- If the new messages contradict or update previous information, reflect the most current state

Return a JSON object with the following structure:
{
  "problem_statement": "An updated clear statement of the problem or topic discussed (incorporating new information)",
  "key_participants": ["array", "of", "all", "participant", "names", "including", "new", "ones"],
  "timeline_summary": "An updated summary of the timeline of events, including the new messages",
  "resolution_status": "Updated status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Updated customer sentiment based on all messages (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {
      "text": "Action item description",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
- Only extract next steps that are EXPLICITLY mentioned in the conversation (including new messages)
- Do NOT create or infer next steps if they are not clearly stated
- If no next steps are mentioned, return an empty array []
- For owner: Extract the name or email of the person responsible. If not mentioned, use null
- For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
- Do not hallucinate or make up next steps
- Update existing next steps if they are mentioned in new messages, or add new ones if explicitly stated

Sentiment Categories & Scores:
- "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
- "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
- "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
- "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
- "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

  const userQuery = `Previous Summary:
${JSON.stringify(previousSummary, null, 2)}

New Messages in Thread:
${newMessagesScript}

Please update the summary to incorporate the new messages and return the updated JSON summary.`;

  try {
    const apiCallFunction = async () => {
      return await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        response_format: { type: "json_object" }
      });
    };

    const completion = await openAiCallWithBackoff(apiCallFunction, 5);
    const responseContent = completion.choices[0]?.message?.content;
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from OpenAI (incremental):", completion);
      throw new Error("Invalid response from OpenAI.");
    }
  } catch (error) {
    console.error("Error in summarizeThreadIncremental:", error);
    throw error;
  }
};

// --- NEW ---
// This is the main "Router" function from Task 3.4
// Now supports incremental summarization when previousSummary is provided
const summarizeThread = async (
  messages: any[], 
  csmEmail: string,
  previousSummary?: any,
  isIncremental: boolean = false
): Promise<any> => {
  // If we have a previous summary and this is an incremental update, use incremental summarization
  if (isIncremental && previousSummary && !previousSummary.error) {
    console.log("🔄 Using incremental summarization with previous summary...");
    return await summarizeThreadIncremental(previousSummary, messages, csmEmail);
  }

  // Otherwise, process all messages (full summarization)
  const script = formatThreadForLLM(messages, csmEmail);
  const tokenCount = estimateTokens(script);
  // gpt-4o has ~128k context window, but we'll use 100k as a safe limit
  const TOKEN_LIMIT = 100000;

  let summaryJson: any;
  if (tokenCount < (TOKEN_LIMIT - 2000)) {
    console.log("📝 Processing full thread (short)...");
    summaryJson = await processShortThread(script);
  } else {
    console.log("📝 Processing full thread (long, using map-reduce)...");
    summaryJson = await processLongThread(script);
  }
  return summaryJson;
};


// --- Helper function to safely update job status ---
async function updateJobStatus(jobId: string | null | undefined, status: 'pending' | 'running' | 'completed' | 'failed', details: string): Promise<void> {
  if (!jobId) {
    console.warn('Cannot update job status: jobId is missing');
    return;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { error } = await supabaseAdmin
      .from('sync_jobs')
      .update({ status, details })
      .eq('id', jobId);

    if (error) {
      console.error(`Failed to update job status for job ${jobId}:`, error);
    } else {
      console.log(`✅ Job ${jobId} status updated to: ${status}`);
    }
  } catch (error) {
    console.error(`Error updating job status for job ${jobId}:`, error);
  }
}

// --- Main Serve Function ---
serve(async (req: Request) => {
  // --- UNCHANGED ---
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Initialize variables outside try block for error handling
  let jobId: string | null = null;
  let supabaseAdmin: ReturnType<typeof createClient> | null = null;

  // Main try-catch block to ensure job status is always managed
  try {
    // Parse request body with error handling
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      throw new Error(`Failed to parse request body: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    const { jobId: parsedJobId, provider_token, pageToken } = requestBody;
    jobId = parsedJobId || null;

    // Validate required parameters
    if (!jobId || !provider_token) {
      throw new Error("Missing jobId or provider_token in request body.");
    }

    // Create Supabase admin client early
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Update job status to 'running' if this is the first page
    if (!pageToken) {
      await updateJobStatus(jobId, 'running', 'Starting thread sync...');
    }
    
    // --- MODIFIED ---
    // Added local arrays to store data for batch insert
    let threadsToStore: any[] = [];
    let messagesToStore: any[] = [];
    let linksToStore: any[] = [];

    // --- MODIFIED ---
    // Fetch user_email from profiles table via user_id
    const { data: jobData, error: jobFetchError } = await supabaseAdmin.from('sync_jobs').select('user_id').eq('id', jobId).single();
    if (jobFetchError || !jobData) {
      throw new Error(`Could not fetch job details for job ID: ${jobId}`);
    }
    const userId = jobData.user_id;
    
    // Now we can log with userId
    if (!pageToken) {
      console.log(`🚀 Starting sync for job ${jobId}, user ${userId}`);
    } else {
      console.log(`📄 Processing page with token: ${pageToken.substring(0, 20)}...`);
    }
    
    // Get user email and last sync time from profiles table
    let { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, threads_last_synced_at')
      .eq('id', userId)
      .single();
    
    // If profile doesn't exist, try to create it from auth.users data
    if (profileError || !profileData) {
      console.warn(`⚠️ Profile not found for user ${userId}. Attempting to create profile from auth.users...`);
      
      // Fetch user data from auth.users
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
      
      if (authError || !authUser?.user) {
        throw new Error(`Could not fetch profile or auth user for user ID: ${userId}. Profile error: ${profileError?.message || 'Profile not found'}, Auth error: ${authError?.message || 'Auth user not found'}`);
      }
      
      const user = authUser.user;
      const provider = user.app_metadata?.provider || 'google';
      const providerId = user.app_metadata?.provider_id || user.user_metadata?.provider_id || user.email || '';
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;
      
      // Create profile
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email: user.email || '',
          full_name: fullName,
          provider: provider,
          provider_id: providerId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('email, threads_last_synced_at')
        .single();
      
      if (createError || !newProfile) {
        throw new Error(`Could not create profile for user ID: ${userId}. Error: ${createError?.message || 'Unknown error'}`);
      }
      
      console.log(`✅ Created profile for user ${userId}`);
      profileData = newProfile;
    }
    
    const userEmail = profileData.email || ""; // Get user's email for CSM role
    const profileLastSyncedAt = profileData.threads_last_synced_at;
    
    // Log timestamp status (only on first page to reduce noise)
    if (!pageToken) {
      if (profileLastSyncedAt) {
        console.log(`📅 Profile last synced at: ${profileLastSyncedAt} (UTC)`);
      } else {
        console.log(`📅 No previous sync timestamp found in profiles table`);
      }
    }
    
    // --- NEW CODE START ---
    // 1. Fetch the user's blocklist (both archived and deleted domains should be blocked)
    const { data: blockedDomains, error: blocklistError } = await supabaseAdmin
      .from('domain_blocklist')
      .select('domain, status')
      .eq('user_id', userId);

    if (blocklistError) {
      throw new Error(`Failed to fetch domain blocklist: ${blocklistError.message}`);
    }

    // 2. Build the Gmail query exclusion string
    // Block both archived and deleted domains (both should prevent new imports)
    let exclusionQuery = "";
    if (blockedDomains && blockedDomains.length > 0) {
      const exclusionString = blockedDomains.map(d => `-from:(*@${d.domain})`).join(' ');
      exclusionQuery = ` ${exclusionString}`; // e.g., " -from:(*@binance.com)"
      console.log(`🚫 Blocking ${blockedDomains.length} domain(s) from sync (${blockedDomains.filter(d => d.status === 'archived').length} archived, ${blockedDomains.filter(d => d.status === 'deleted').length} deleted)`);
    }
    // --- NEW CODE END ---
    
    // --- NEW ---
    // Get the last sync time from profiles table (stored in UTC)
    // This determines what date to query Gmail from
    // All times are handled in UTC to ensure consistency across timezones
    let lastSyncTime: Date;
    
    if (profileLastSyncedAt) {
      // Use the stored UTC timestamp from profiles table
      lastSyncTime = new Date(profileLastSyncedAt);
      // Subtract 1 day from last sync time to ensure we catch threads that were updated
      // right at the boundary (Gmail's after: query is inclusive)
      lastSyncTime = new Date(lastSyncTime.getTime() - (24 * 60 * 60 * 1000)); // Subtract 1 day
      console.log(`📅 Last sync time (UTC): ${lastSyncTime.toISOString()}. Querying threads modified after this date.`);
    } else {
      // If no last sync time, default to 90 days ago (in UTC)
      lastSyncTime = new Date();
      lastSyncTime.setUTCDate(lastSyncTime.getUTCDate() - 90);
      console.log(`📅 No previous sync found. Starting from 90 days ago (UTC): ${lastSyncTime.toISOString()}`);
    }
    
    // --- MODIFIED ---
    // 1. Get a list of IDs - query from last sync time (converted to Unix timestamp for Gmail API)
    // Gmail API expects Unix timestamp in seconds
    const unixTimestamp = Math.floor(lastSyncTime.getTime() / 1000);
    const baseQuery = `after:${unixTimestamp}`;
    
    // --- MODIFIED ---
    // Combine base query with exclusion query
    const finalQuery = `${baseQuery}${exclusionQuery}`;
    
    // --- MODIFIED ---
    // Swapped 'messages' for 'threads'
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(finalQuery)}&maxResults=10`; // MODIFIED: maxResults=10 for safety
    
    // --- UNCHANGED ---
    if (pageToken) {
      listUrl += `&pageToken=${pageToken}`;
    }
    const listResp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${provider_token}` }
    });
    if (!listResp.ok) {
      throw new Error(`Gmail API list request failed: ${await listResp.text()}`);
    }
    const listJson = await listResp.json();
    
    // --- MODIFIED ---
    // Swapped 'messages' for 'threads'
    const threadIds = listJson.threads?.map((t: any) => t.id).filter(Boolean) || [];

    // --- NEW ---
    // Early exit if no threads and no next page
    if (threadIds.length === 0 && !listJson.nextPageToken) {
      await updateJobStatus(jobId, 'completed', 'No threads found to sync.');
      return new Response(JSON.stringify({ message: "No threads to process." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --- NEW ---
    // Batch check for existing threads - we need last_message_date to determine if thread needs update
    let existingThreadsMap = new Map<string, { thread_id: string; last_message_date: string | null }>();
    if (threadIds.length > 0) {
      const { data: existingThreads, error: existingError } = await supabaseAdmin
        .from('threads')
        .select('thread_id, last_message_date')
        .eq('user_id', userId)
        .in('thread_id', threadIds);
      
      if (existingError) {
        console.warn('Failed to check existing threads:', existingError);
        // Continue processing even if check fails
      } else {
        existingThreads.forEach(t => {
          existingThreadsMap.set(t.thread_id, {
            thread_id: t.thread_id,
            last_message_date: t.last_message_date
          });
        });
        console.log(`📊 Found ${existingThreadsMap.size} existing threads out of ${threadIds.length} total`);
      }
    }

    if (threadIds.length > 0) {
      
      // --- MODIFIED ---
      // This is the new main loop, iterating over THREADS
      for (const threadId of threadIds) {
        try {
          const existingThread = existingThreadsMap.get(threadId);
          
          console.log(`🧵 Processing thread with threadId: ${threadId}`);
          
          // --- MODIFIED ---
          // Fetch the full thread, not just a message
          const threadResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
            headers: { Authorization: `Bearer ${provider_token}` }
          });
          
          if (!threadResp.ok) {
            console.warn(`Failed to fetch details for thread ${threadId}. Skipping.`);
            continue;
          }
          
          const threadJson = await threadResp.json();
          const messages = threadJson.messages || [];
          if (messages.length === 0) {
            console.log(`Skipping empty thread ${threadId}`);
            continue;
          }
          
          // --- NEW ---
          // Check if thread exists and if it has new messages
          const lastMessage = messages[messages.length - 1];
          const lastMessageDate = new Date(Number(lastMessage.internalDate));
          
          if (existingThread) {
            const existingLastMessageDate = existingThread.last_message_date 
              ? new Date(existingThread.last_message_date) 
              : null;
            
            // If thread exists and last message date hasn't changed, skip processing
            if (existingLastMessageDate && lastMessageDate.getTime() <= existingLastMessageDate.getTime()) {
              console.log(`⏭️ Thread ${threadId} exists and has no new messages. Skipping.`);
              continue;
            } else {
              console.log(`🔄 Thread ${threadId} exists but has new messages. Updating...`);
              // Continue processing to update the thread
            }
          } else {
              console.log(`✨ Thread ${threadId} is new. Processing...`);
          }
          
          // --- NEW ---
          // (Task 2.9) Discovery Loop: Find all companies & customers in this thread
          const discoveredCompanyIds = new Map<string, boolean>();
          const discoveredCustomerIds = new Map<string, string>(); // Map<email, customer_id (uuid)>
          const msgCustomerMap = new Map<string, string | null>(); // Map<message_id, customer_id (uuid)>

          for (const msg of messages) {
            const msgHeaders = msg.payload?.headers || [];
            const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
            const toHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
            const ccHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
            
            const allParticipantHeaders = [fromHeader, toHeader, ccHeader];
            
            for (const header of allParticipantHeaders) {
              const emails = header.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
              for (const email of emails) {
                if (email === userEmail) continue; // Skip internal email

                const domain = email.split('@')[1];
                if (!domain) continue;
                
                // This is your exact, proven company/customer creation logic
                try {
                  const companyName = domain.split('.')[0].split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                  
                  const { data: company, error: companyError } = await supabaseAdmin.from('companies').upsert({
                    domain_name: domain,
                    company_name: companyName,
                    user_id: userId
                  }, {
                    onConflict: 'user_id, domain_name', // Your existing schema
                    ignoreDuplicates: false
                  }).select('company_id').single();

                  if (companyError) throw companyError;
                  const companyId = company?.company_id; // This is UUID

                  if (companyId) {
                    discoveredCompanyIds.set(companyId, true); // Add to our set
                    
                    const senderName = fromHeader.includes(email) ? (fromHeader.split('<')[0].trim().replace(/"/g, '') || email) : email;

                    const { data: customer, error: customerError } = await supabaseAdmin
                      .from('customers')
                      .upsert(
                        {
                          email: email,
                          full_name: senderName,
                          company_id: companyId,
                        },
                        {
                          onConflict: 'email', // Fixed: matches database constraint (customers_email_key)
                          ignoreDuplicates: false,
                        }
                      )
                      .select('customer_id')
                      .single();

                    // --- CRITICAL CHECK ---
                    if (customerError) {
                      console.error(`!!! FATAL: Failed to upsert customer ${email} for company ${companyId}. Error:`, customerError);
                      // Throw the error to stop this thread from being processed
                      // This will be caught by the main try/catch and fail the job.
                      throw new Error(`Customer upsert failed: ${customerError.message}`);
                    }

                    if (!customer) {
                      // This should not happen if the upsert is correct, but it's a good failsafe
                      throw new Error(`Customer data not returned for ${email} after upsert.`);
                    }
                    // --- END CRITICAL CHECK ---

                    const customerId = customer.customer_id; // UUID
                    discoveredCustomerIds.set(email, customerId);
                    
                    if (fromHeader.includes(email)) {
                      msgCustomerMap.set(msg.id, customerId); // Map this message to its sender
                    }
                  }
                } catch (error) {
                  console.error(`Error in company/customer creation for ${email}:`, error);
                  // Re-throw customer upsert errors to fail the job
                  if (error instanceof Error && error.message.includes('Customer upsert failed')) {
                    throw error;
                  }
                  // For other errors (like company creation), continue processing
                }
              }
            }
          }

          // --- NEW ---
          // For existing threads, check which messages are new
          let existingMessageIds = new Set<string>();
          let previousSummary: any = null;
          let newMessages: any[] = [];
          
          if (existingThread) {
            const { data: existingMessages, error: msgCheckError } = await supabaseAdmin
              .from('thread_messages')
              .select('message_id')
              .eq('thread_id', threadId)
              .eq('user_id', userId);
            
            if (!msgCheckError && existingMessages) {
              existingMessageIds = new Set(existingMessages.map(m => m.message_id));
              console.log(`📨 Found ${existingMessageIds.size} existing messages in thread ${threadId}`);
            }
            
            // Get the previous summary if it exists
            if (existingThread.llm_summary) {
              previousSummary = existingThread.llm_summary;
              console.log(`📋 Found existing summary for thread ${threadId}`);
            }
            
            // Filter to only new messages for incremental summarization
            newMessages = messages.filter(msg => !existingMessageIds.has(msg.id));
            console.log(`🆕 Found ${newMessages.length} new messages out of ${messages.length} total messages`);
          } else {
            // For new threads, all messages are "new"
            newMessages = messages;
          }
          
          // --- NEW ---
          // (Task 2.11) Prep Messages Loop: Create all message data objects
          // Only add messages that don't already exist (for existing threads)
          for (const msg of messages) {
            // Skip if message already exists (for existing threads)
            if (existingThread && existingMessageIds.has(msg.id)) {
              continue;
            }
            const msgHeaders = msg.payload?.headers || [];
            const bodies = collectBodies(msg.payload);
            
            // Parse to_addresses and cc_addresses properly
            const toValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
            const ccValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
            
            const msgData = {
              message_id: msg.id,
              thread_id: threadId,
              user_id: userId,
              customer_id: msgCustomerMap.get(msg.id) || null, // Assign the sender's customer_id
              from_address: msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value,
              to_addresses: toValue ? JSON.parse(JSON.stringify(toValue.split(',').map((e: string) => e.trim()))) : [],
              cc_addresses: ccValue ? JSON.parse(JSON.stringify(ccValue.split(',').map((e: string) => e.trim()))) : [],
              sent_date: new Date(Number(msg.internalDate)).toISOString(),
              snippet: msg.snippet,
              body_text: bodies.text,
              body_html: bodies.html
            };
            messagesToStore.push(msgData);
          }

          // --- NEW ---
          // (Task 2.12) Summarize Thread
          // Use incremental summarization if we have a previous summary and new messages
          let summaryJson: any;
          
          if (existingThread && newMessages.length === 0) {
            // No new messages, keep the existing summary
            console.log(`ℹ️ No new messages for thread ${threadId}, keeping existing summary`);
            summaryJson = previousSummary || existingThread.llm_summary;
          } else {
            // Determine if we should use incremental summarization
            // Only use incremental if: thread exists, has a previous summary, and has new messages
            const isIncremental = existingThread && previousSummary && newMessages.length > 0;
            
            // If incremental: only summarize new messages (previous summary provides context)
            // If not incremental: summarize all messages (either new thread or no previous summary)
            const messagesToSummarize = isIncremental ? newMessages : messages;
            
            if (isIncremental) {
              console.log(`🔄 Incremental summarization: updating summary with ${newMessages.length} new message(s)`);
            } else if (existingThread && !previousSummary) {
              console.log(`📝 Full summarization: thread exists but no previous summary, summarizing all ${messages.length} messages`);
            } else {
              console.log(`📝 Full summarization: new thread with ${messages.length} messages`);
            }
            
            summaryJson = await summarizeThread(
              messagesToSummarize, 
              userEmail,
              previousSummary,
              isIncremental
            );
          }

          // --- NEW ---
          // Extract and validate sentiment_score from summaryJson
          let sentimentScore: number | null = null;
          if (summaryJson && !summaryJson.error) {
            const score = summaryJson.sentiment_score;
            // Validate sentiment_score is a number between -2 and 2
            if (typeof score === 'number' && score >= -2 && score <= 2) {
              sentimentScore = score;
            } else {
              // Try to map old sentiment text to new score if sentiment_score is missing
              const sentimentText = summaryJson.customer_sentiment;
              if (typeof sentimentText === 'string') {
                const sentimentMap: Record<string, number> = {
                  'Very Positive': 2,
                  'Positive': 1,
                  'Neutral': 0,
                  'Negative': -1,
                  'Very Negative': -2,
                  'Frustrated': -2, // Map old "Frustrated" to -2
                };
                sentimentScore = sentimentMap[sentimentText] ?? 0;
              } else {
                sentimentScore = 0; // Default to neutral
              }
            }
            console.log(`📊 Extracted sentiment_score: ${sentimentScore} for thread ${threadId}`);
          }

          // Update sentiment_score for all customer messages in this thread
          if (sentimentScore !== null) {
            // Update new messages that will be inserted
            for (let i = 0; i < messagesToStore.length; i++) {
              const msg = messagesToStore[i];
              // Only set sentiment_score for messages from customers (where customer_id is not null)
              if (msg.customer_id) {
                messagesToStore[i] = {
                  ...msg,
                  sentiment_score: sentimentScore
                };
              }
            }
            
            // Also update existing customer messages in the thread with the new sentiment_score
            // This ensures all messages in the thread have the same sentiment_score
            const { error: updateError } = await supabaseAdmin
              .from('thread_messages')
              .update({ sentiment_score: sentimentScore })
              .eq('thread_id', threadId)
              .not('customer_id', 'is', null);
            
            if (updateError) {
              console.warn(`⚠️ Failed to update sentiment_score for existing messages in thread ${threadId}:`, updateError);
              // Don't throw - this is not critical, continue processing
            } else {
              console.log(`✅ Updated sentiment_score for existing customer messages in thread ${threadId}`);
            }
          }

          // --- NEW ---
          // (Task 2.8 & 2.10) Prep Thread & Links
          const firstMessage = messages[0];
          // lastMessage was already declared earlier at line 562, reuse it
          const subject = firstMessage.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          
          const threadData = {
            thread_id: threadId,
            user_id: userId,
            subject: subject,
            snippet: threadJson.snippet,
            last_message_date: new Date(Number(lastMessage.internalDate)).toISOString(),
            llm_summary: summaryJson,
            llm_summary_updated_at: new Date().toISOString()
          };
          threadsToStore.push(threadData);

          for (const companyId of discoveredCompanyIds.keys()) {
            linksToStore.push({
              thread_id: threadId,
              company_id: companyId,
              user_id: userId
            });
          }
          
          console.log(`✅ Successfully processed thread ${threadId} - ${messages.length} messages, ${discoveredCompanyIds.size} companies. Added to batch.`);

        } catch (error) {
          console.error(`Failed to process thread ${threadId}. Skipping. Error:`, error);
          // Re-throw customer upsert errors to fail the entire job
          if (error instanceof Error && error.message.includes('Customer upsert failed')) {
            throw error;
          }
          // For other thread processing errors, continue with next thread
        }
      }
    }
    
    // --- MODIFIED ---
    // Batch insert logic - insert threads, messages, and links separately
    // (We'll create a SQL function later for transactional inserts, but for now use individual inserts)
    if (threadsToStore.length > 0) {
      console.log(`🧵 Saving ${threadsToStore.length} threads, ${messagesToStore.length} messages, and ${linksToStore.length} links to database...`);
      
      // Insert threads
      const { error: threadsError } = await supabaseAdmin.from('threads').upsert(threadsToStore, {
        onConflict: 'thread_id',
        ignoreDuplicates: false
      });
      
      // Process next steps for each thread that has a summary with next steps
      if (!threadsError) {
        for (const threadData of threadsToStore) {
          if (threadData.llm_summary && typeof threadData.llm_summary === 'object') {
            const summary = threadData.llm_summary as any;
            const hasNextSteps = (
              (summary.next_steps && Array.isArray(summary.next_steps) && summary.next_steps.length > 0) ||
              (summary.csm_next_step && typeof summary.csm_next_step === 'string' && summary.csm_next_step.trim() !== '')
            );
            
            if (hasNextSteps) {
              // Call process-next-steps edge function asynchronously (don't wait)
              supabaseAdmin.functions.invoke('process-next-steps', {
                body: {
                  source_type: 'thread',
                  source_id: threadData.thread_id
                }
              }).catch(err => {
                console.error(`Failed to invoke process-next-steps for thread ${threadData.thread_id}:`, err);
                // Don't throw - this is not critical for the sync to continue
              });
            }
          }
        }
      }
      
      if (threadsError) {
        console.error("Database error saving threads:", threadsError);
        await updateJobStatus(jobId, 'failed', `Database error saving threads: ${threadsError.message}`);
        throw threadsError;
      }
      
      // Insert messages
      if (messagesToStore.length > 0) {
        const { error: messagesError } = await supabaseAdmin.from('thread_messages').upsert(messagesToStore, {
          onConflict: 'message_id',
          ignoreDuplicates: false
        });
        
        if (messagesError) {
          console.error("Database error saving messages:", messagesError);
          await updateJobStatus(jobId, 'failed', `Database error saving messages: ${messagesError.message}`);
          throw messagesError;
        }
      }
      
      // Insert links
      if (linksToStore.length > 0) {
        const { error: linksError } = await supabaseAdmin.from('thread_company_link').upsert(linksToStore, {
          onConflict: 'thread_id, company_id',
          ignoreDuplicates: true // Allow duplicates for links
        });
        
        if (linksError) {
          console.error("Database error saving links:", linksError);
          await updateJobStatus(jobId, 'failed', `Database error saving links: ${linksError.message}`);
          throw linksError;
        }
      }
      
      console.log(`✅ Successfully saved batch data to database`);
    } else {
      console.log("⚠️ No new threads to save.");
    }

    // --- MODIFIED ---
    // This logic is the same, but we invoke 'sync-threads' and update the text
    if (listJson.nextPageToken) {
      // Chain to the next page with proper error handling
      try {
        // Only log on first page to reduce noise
        if (!pageToken) {
          console.log(`📄 Processing multiple pages. Current page has ${listJson.threads?.length || 0} threads. Chaining to next page...`);
        }
        
        const { data, error } = await supabaseAdmin.functions.invoke('sync-threads', {
          body: {
            jobId: jobId,
            provider_token,
            pageToken: listJson.nextPageToken
          }
        });
        
        if (error) {
          console.error(`❌ Failed to invoke next page (token: ${listJson.nextPageToken.substring(0, 20)}...):`, error);
          await updateJobStatus(jobId, 'failed', `Failed to process next page: ${error.message}`);
          throw new Error(`Failed to invoke next page: ${error.message}`);
        }
        
        // Don't log success for every page - too noisy. Only log errors.
      } catch (invokeError) {
        console.error('❌ Error invoking next page:', invokeError);
        const errorMessage = invokeError instanceof Error ? invokeError.message : String(invokeError);
        await updateJobStatus(jobId, 'failed', `Error processing next page: ${errorMessage}`);
        throw invokeError;
      }
    } else {
      // Complete the job and update last sync time in profiles table
      console.log('✅ No more pages. Completing job.');
      
      // Update threads_last_synced_at in profiles table with current UTC time
      const currentUTCTime = new Date().toISOString(); // ISO string is always in UTC
      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({ threads_last_synced_at: currentUTCTime })
        .eq('id', userId);
      
      if (updateProfileError) {
        console.error('⚠️ Failed to update threads_last_synced_at in profiles:', updateProfileError);
        // Don't fail the job if timestamp update fails, but log it
      } else {
        console.log(`✅ Updated threads_last_synced_at to ${currentUTCTime} (UTC) for user ${userId}`);
      }
      
      await updateJobStatus(jobId, 'completed', 'All threads have been synced.');
    }

    // --- UNCHANGED ---
    return new Response(JSON.stringify({
      message: "Thread batch processed successfully."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202 // Accepted
    });

  } catch (error) {
    // --- ENHANCED ---
    // Comprehensive error handling - always update job status to prevent stuck jobs
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = `Thread sync failed: ${errorMessage}`;
    
    console.error('❌ Error in sync-threads function:', errorDetails);
    
    // Always attempt to update job status, even if other operations failed
    await updateJobStatus(jobId, 'failed', errorDetails);
    
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

