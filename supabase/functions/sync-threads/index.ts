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
  "customer_sentiment": "Customer sentiment (e.g., 'Positive', 'Neutral', 'Negative', 'Frustrated')",
  "csm_next_step": "Recommended next step for the CSM"
}

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
  "customer_sentiment": "Customer sentiment (e.g., 'Positive', 'Neutral', 'Negative', 'Frustrated')",
  "csm_next_step": "Recommended next step for the CSM"
}`;

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
// This is the main "Router" function from Task 3.4
const summarizeThread = async (messages: any[], csmEmail: string): Promise<any> => {
  const script = formatThreadForLLM(messages, csmEmail);
  const tokenCount = estimateTokens(script);
  // gpt-4o has ~128k context window, but we'll use 100k as a safe limit
  const TOKEN_LIMIT = 100000;

  let summaryJson: any;
  if (tokenCount < (TOKEN_LIMIT - 2000)) {
    console.log("Processing short thread...");
    summaryJson = await processShortThread(script);
  } else {
    console.log("Processing long thread (using map-reduce)...");
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
    
    // Get user email from profiles table
    const { data: profileData, error: profileError } = await supabaseAdmin.from('profiles').select('email').eq('id', userId).single();
    const userEmail = profileData?.email || ""; // Get user's email for CSM role
    
    // --- NEW CODE START ---
    // 1. Fetch the user's blocklist
    const { data: blockedDomains, error: blocklistError } = await supabaseAdmin
      .from('domain_blocklist')
      .select('domain')
      .eq('user_id', userId);

    if (blocklistError) {
      throw new Error(`Failed to fetch domain blocklist: ${blocklistError.message}`);
    }

    // 2. Build the Gmail query exclusion string
    let exclusionQuery = "";
    if (blockedDomains && blockedDomains.length > 0) {
      const exclusionString = blockedDomains.map(d => `-from:(*@${d.domain})`).join(' ');
      exclusionQuery = ` ${exclusionString}`; // e.g., " -from:(*@binance.com)"
    }
    // --- NEW CODE END ---
    
    // --- UNCHANGED ---
    // 1. Get a list of IDs
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const baseQuery = `after:${Math.floor(ninetyDaysAgo.getTime() / 1000)}`;
    
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

    if (threadIds.length > 0) {
      
      // --- MODIFIED ---
      // This is the new main loop, iterating over THREADS
      for (const threadId of threadIds) {
        try {
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
                          onConflict: 'email, company_id', // Fixed: matches database constraint
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
          // (Task 2.11) Prep Messages Loop: Create all message data objects
          for (const msg of messages) {
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
          const summaryJson = await summarizeThread(messages, userEmail);

          // --- NEW ---
          // (Task 2.8 & 2.10) Prep Thread & Links
          const firstMessage = messages[0];
          const lastMessage = messages[messages.length - 1];
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
      // Chain to the next page
      await supabaseAdmin.functions.invoke('sync-threads', { // MODIFIED
        body: {
          jobId: jobId,
          provider_token,
          pageToken: listJson.nextPageToken
        }
      });
    } else {
      // Complete the job
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

