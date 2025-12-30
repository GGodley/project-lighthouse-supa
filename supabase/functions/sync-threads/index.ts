//
// 🚀 This is the NEW sync-threads Edge Function, adapted from sync-emails 🚀
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { saveFeatureRequests } from "../_shared/feature-request-utils.ts";
import { mapFeatureRequests } from "../_shared/feature-request-mapper.ts";

// --- UNCHANGED ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

// --- Utility Functions ---
// Sleep helper for retry delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Triggers AI insights generation asynchronously via Trigger.dev
 * Only called when a new company is created (not for existing companies)
 * This is a fire-and-forget operation - failures are non-critical
 */
async function triggerCompanyInsightsGeneration(
  companyId: string,
  domainName: string,
  userId: string
): Promise<void> {
  const triggerApiKey = Deno.env.get('TRIGGER_API_KEY');
  if (!triggerApiKey) {
    console.warn('TRIGGER_API_KEY not set, skipping AI insights generation');
    return;
  }

  try {
    const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/generate-company-insights/trigger';
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: { companyId, domainName, userId },
        concurrencyKey: companyId, // Prevent duplicate runs for same company
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to trigger AI insights generation:', errorText);
    } else {
      console.log(`✅ Triggered AI insights generation for company ${companyId}`);
    }
  } catch (err) {
    // Non-critical error - don't fail company creation if this fails
    console.error('Failed to trigger AI insights generation (non-critical):', err);
  }
}

// Gemini API call wrapper with retry and backoff for rate limits
async function geminiCallWithBackoff<T>(
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
        console.error(`❌ Gemini API call failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      // Check if it's a rate limit error (only retry if we haven't exhausted attempts)
      if (error?.code === 'rate_limit_exceeded' || error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn(`⚠️ Gemini rate limit hit (attempt ${attempt}/${maxRetries})`);
        
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

// --- UPDATED ---
// Helper Functions to Correctly Parse Gmail's Complex Payload
// Fixed to properly decode UTF-8 characters using TextDecoder
const decodeBase64Url = (data: string | undefined): string | undefined => {
  if (!data) return undefined;
  try {
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while(base64.length % 4){
      base64 += '=';
    }
    // Decode base64 to binary string
    const binaryString = atob(base64);
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Decode Uint8Array to UTF-8 string using TextDecoder
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
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
// This function calls the Gemini API and requests a structured JSON response
const processShortThread = async (script: string): Promise<any> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping summarization");
    return { "error": "GEMINI_API_KEY not configured" };
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
      "due_date": "YYYY-MM-DD or null if not mentioned",
      "priority": "The urgency level ('high', 'medium', 'low')"
    }
  ],
  "feature_requests": [
    {
      "title": "A brief name that represents the feature conceptually (e.g., 'Bulk User Editing', 'API Export for Reports')",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority (e.g. 'we need this before Q1 launch,' 'this is causing delays,' 'not urgent but useful')",
      "customer_impact": "Who is affected and how (1 sentence)"
    }
  ]
}

Feature Request Detection & Extraction:

1. Detect Feature Requests

Identify any sentence or paragraph where the customer is:
• Requesting a new feature
• Suggesting an improvement
• Reporting a limitation that implies a feature is missing
• Asking for a capability that doesn't exist yet

If no feature requests exist, return an empty array [].

2. Extract & Summarize Each Feature Request

For every feature request found:
• Title (generic, short): A brief name that represents the feature conceptually (e.g., "Bulk User Editing", "API Export for Reports").
• Customer Description (raw meaning): A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.
• Use Case / Problem: Why the customer wants it; what problem they are trying to solve.
• Urgency Level: Categorize as:
  * High – Blocking workflows, time-sensitive, critical pain.
  * Medium – Important but not blocking.
  * Low – Nice-to-have or long-term improvement.
• Signals that justify the urgency rating: Quote or paraphrase the phrasing that indicates priority (e.g. "we need this before Q1 launch," "this is causing delays," "not urgent but useful").
• Customer Impact: Who is affected and how (1 sentence).

3. Additional Rules
• Make all titles and descriptions general enough that similar requests across customers can be grouped later.
• Be consistent in naming patterns so clustering will work well.

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• For priority: Assess the urgency level based on context. Use 'high' for time-sensitive or blocking items, 'medium' for important but not urgent items, 'low' for nice-to-have items. If unclear, default to 'medium'
• Do not hallucinate or make up next steps

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

  const userQuery = `Email Thread:\n\n${script}\n\nPlease analyze this thread and return the JSON summary.`;

  try {
    // Combine system and user prompts since Gemini doesn't use role-based messages
    const fullPrompt = `${systemPrompt}\n\n${userQuery}`;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // Wrap the API call with retry logic
    const apiCallFunction = async () => {
      const result = await model.generateContent(fullPrompt);
      return result.response.text();
    };

    const responseContent = await geminiCallWithBackoff(apiCallFunction, 5);
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from Gemini:", responseContent);
      throw new Error("Invalid response from Gemini.");
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
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping summarization");
    return { "error": "GEMINI_API_KEY not configured" };
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
      // Combine system and user prompts since Gemini doesn't use role-based messages
      const fullPrompt = `${mapPrompt}\n\n${chunk}`;
      
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
      });

      // Wrap the API call with retry logic
      const apiCallFunction = async () => {
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
      };

      const text = await geminiCallWithBackoff(apiCallFunction, 5);
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
      "due_date": "YYYY-MM-DD or null if not mentioned",
      "priority": "The urgency level ('high', 'medium', 'low')"
    }
  ],
  "feature_requests": [
    {
      "title": "A brief name that represents the feature conceptually (e.g., 'Bulk User Editing', 'API Export for Reports')",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority (e.g. 'we need this before Q1 launch,' 'this is causing delays,' 'not urgent but useful')",
      "customer_impact": "Who is affected and how (1 sentence)"
    }
  ]
}

Feature Request Detection & Extraction:

1. Detect Feature Requests

Identify any sentence or paragraph where the customer is:
• Requesting a new feature
• Suggesting an improvement
• Reporting a limitation that implies a feature is missing
• Asking for a capability that doesn't exist yet

If no feature requests exist, return an empty array [].

2. Extract & Summarize Each Feature Request

For every feature request found:
• Title (generic, short): A brief name that represents the feature conceptually (e.g., "Bulk User Editing", "API Export for Reports").
• Customer Description (raw meaning): A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.
• Use Case / Problem: Why the customer wants it; what problem they are trying to solve.
• Urgency Level: Categorize as:
  * High – Blocking workflows, time-sensitive, critical pain.
  * Medium – Important but not blocking.
  * Low – Nice-to-have or long-term improvement.
• Signals that justify the urgency rating: Quote or paraphrase the phrasing that indicates priority (e.g. "we need this before Q1 launch," "this is causing delays," "not urgent but useful").
• Customer Impact: Who is affected and how (1 sentence).

3. Additional Rules
• Make all titles and descriptions general enough that similar requests across customers can be grouped later.
• Be consistent in naming patterns so clustering will work well.

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• For priority: Assess the urgency level based on context. Use 'high' for time-sensitive or blocking items, 'medium' for important but not urgent items, 'low' for nice-to-have items. If unclear, default to 'medium'
• Do not hallucinate or make up next steps

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues`;

  const reduceQuery = `Intermediate Summaries:\n\n${combinedSummaries}\n\nPlease analyze these summaries and generate the final JSON report.`;

  try {
    // Combine system and user prompts since Gemini doesn't use role-based messages
    const fullPrompt = `${reducePrompt}\n\n${reduceQuery}`;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // Wrap the API call with retry logic
    const apiCallFunction = async () => {
      const result = await model.generateContent(fullPrompt);
      return result.response.text();
    };

    const responseContent = await geminiCallWithBackoff(apiCallFunction, 5);
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from Gemini (reduce step):", responseContent);
      throw new Error("Invalid response from Gemini.");
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
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping summarization");
    return { "error": "GEMINI_API_KEY not configured" };
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
      "due_date": "YYYY-MM-DD or null if not mentioned",
      "priority": "The urgency level ('high', 'medium', 'low')"
    }
  ],
  "feature_requests": [
    {
      "title": "A brief name that represents the feature conceptually (e.g., 'Bulk User Editing', 'API Export for Reports')",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority (e.g. 'we need this before Q1 launch,' 'this is causing delays,' 'not urgent but useful')",
      "customer_impact": "Who is affected and how (1 sentence)"
    }
  ]
}

Feature Request Detection & Extraction:

1. Detect Feature Requests

Identify any sentence or paragraph where the customer is:
• Requesting a new feature
• Suggesting an improvement
• Reporting a limitation that implies a feature is missing
• Asking for a capability that doesn't exist yet

If no feature requests exist, return an empty array [].

2. Extract & Summarize Each Feature Request

For every feature request found:
• Title (generic, short): A brief name that represents the feature conceptually (e.g., "Bulk User Editing", "API Export for Reports").
• Customer Description (raw meaning): A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.
• Use Case / Problem: Why the customer wants it; what problem they are trying to solve.
• Urgency Level: Categorize as:
  * High – Blocking workflows, time-sensitive, critical pain.
  * Medium – Important but not blocking.
  * Low – Nice-to-have or long-term improvement.
• Signals that justify the urgency rating: Quote or paraphrase the phrasing that indicates priority (e.g. "we need this before Q1 launch," "this is causing delays," "not urgent but useful").
• Customer Impact: Who is affected and how (1 sentence).

3. Additional Rules
• Make all titles and descriptions general enough that similar requests across customers can be grouped later.
• Be consistent in naming patterns so clustering will work well.

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation (including new messages)
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• For priority: Assess the urgency level based on context. Use 'high' for time-sensitive or blocking items, 'medium' for important but not urgent items, 'low' for nice-to-have items. If unclear, default to 'medium'
• Do not hallucinate or make up next steps
• Update existing next steps if they are mentioned in new messages, or add new ones if explicitly stated

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

  const userQuery = `Previous Summary:
${JSON.stringify(previousSummary, null, 2)}

New Messages in Thread:
${newMessagesScript}

Please update the summary to incorporate the new messages and return the updated JSON summary.`;

  try {
    // Combine system and user prompts since Gemini doesn't use role-based messages
    const fullPrompt = `${systemPrompt}\n\n${userQuery}`;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const apiCallFunction = async () => {
      const result = await model.generateContent(fullPrompt);
      return result.response.text();
    };

    const responseContent = await geminiCallWithBackoff(apiCallFunction, 5);
    
    if (responseContent) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid response from Gemini (incremental):", responseContent);
      throw new Error("Invalid response from Gemini.");
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
  // gemini-3-flash-preview has large context window, but we'll use 100k as a safe limit
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
async function updateJobStatus(
  jobId: string | null | undefined, 
  status: 'pending' | 'running' | 'completed' | 'failed', 
  details: string,
  totalPages?: number | null,
  pagesCompleted?: number
): Promise<void> {
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

    const updateData: any = { status, details };
    if (totalPages !== undefined) {
      updateData.total_pages = totalPages;
    }
    if (pagesCompleted !== undefined) {
      updateData.pages_completed = pagesCompleted;
    }

    let { error } = await supabaseAdmin
      .from('sync_jobs')
      .update(updateData)
      .eq('id', jobId);

    // If error is about missing columns, retry without progress tracking columns
    if (error) {
      const errorMessage = error.message || String(error);
      const isMissingColumnError = 
        errorMessage.includes('pages_completed') || 
        errorMessage.includes('total_pages') ||
        errorMessage.includes('PGRST204') ||
        errorMessage.includes('schema cache');
      
      if (isMissingColumnError && (totalPages !== undefined || pagesCompleted !== undefined)) {
        // Retry update without progress tracking columns
        console.warn(`⚠️ Progress tracking columns not found in sync_jobs table. Retrying update without them.`);
        const basicUpdateData = { status, details };
        const { error: retryError } = await supabaseAdmin
          .from('sync_jobs')
          .update(basicUpdateData)
          .eq('id', jobId);
        
        if (retryError) {
          console.error(`Failed to update job status for job ${jobId} (retry without progress columns):`, retryError);
        } else {
          console.log(`✅ Job ${jobId} status updated to: ${status} (progress tracking columns not available)`);
        }
      } else {
        console.error(`Failed to update job status for job ${jobId}:`, error);
      }
    } else {
      console.log(`✅ Job ${jobId} status updated to: ${status}${totalPages !== undefined ? `, total_pages: ${totalPages}` : ''}${pagesCompleted !== undefined ? `, pages_completed: ${pagesCompleted}` : ''}`);
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

    // Check if job is already failed - if so, exit early to prevent continued processing
    const { data: existingJob, error: jobCheckError } = await supabaseAdmin
      .from('sync_jobs')
      .select('status')
      .eq('id', jobId)
      .single();
    
    if (!jobCheckError && existingJob?.status === 'failed') {
      console.warn(`⚠️ Job ${jobId} is already marked as failed. Exiting to prevent continued processing.`);
      return new Response(JSON.stringify({
        message: "Job already failed, exiting."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
    
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
    // Build calendar invitation exclusion string
    // Exclude calendar invitations at the API level to reduce noise
    // Calendar invitations typically have .ics attachments or calendar-related subjects
    const calendarExclusionQuery = ` -filename:.ics -subject:("Accepted:" OR "Declined:" OR "Tentative:" OR "invitation" OR "Invitation")`;
    console.log(`📅 Excluding calendar invitations from thread sync (filtered at Gmail API level)`);
    
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
      // If no last sync time, default to 30 days ago (in UTC)
      lastSyncTime = new Date();
      lastSyncTime.setUTCDate(lastSyncTime.getUTCDate() - 30);
      console.log(`📅 No previous sync found. Starting from 30 days ago (UTC): ${lastSyncTime.toISOString()}`);
    }
    
    // --- MODIFIED ---
    // 1. Get a list of IDs - query from last sync time (converted to Unix timestamp for Gmail API)
    // Gmail API expects Unix timestamp in seconds
    const unixTimestamp = Math.floor(lastSyncTime.getTime() / 1000);
    const baseQuery = `after:${unixTimestamp}`;
    
    // --- MODIFIED ---
    // Combine base query with domain exclusions and calendar invitation exclusions
    // All exclusions happen at the Gmail API level (server-side filtering)
    const finalQuery = `${baseQuery}${exclusionQuery}${calendarExclusionQuery}`;
    
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
    // Progress tracking: Get current job progress and update
    // Handle gracefully if progress columns don't exist
    let currentPagesCompleted = 0;
    let estimatedTotalPages: number | null = null;
    try {
      const { data: currentJob, error: progressError } = await supabaseAdmin
        .from('sync_jobs')
        .select('total_pages, pages_completed')
        .eq('id', jobId)
        .single();
      
      if (!progressError && currentJob) {
        currentPagesCompleted = currentJob?.pages_completed || 0;
        estimatedTotalPages = currentJob?.total_pages || null;
      } else if (progressError) {
        // If columns don't exist, that's okay - just use default value
        const errorMessage = progressError.message || String(progressError);
        if (!errorMessage.includes('pages_completed') && !errorMessage.includes('PGRST204')) {
          // Only log if it's not a missing column error
          console.warn(`⚠️ Could not fetch job progress (columns may not exist):`, progressError);
        }
      }
    } catch (err) {
      // Progress tracking columns may not exist - that's okay
      console.warn(`⚠️ Progress tracking not available (columns may not exist)`);
    }
    
    // If this is the first page, estimate total pages conservatively
    if (!pageToken) {
      // Estimate total pages based on first page results
      // Gmail API returns maxResults=10 per page
      if (listJson.nextPageToken) {
        // We have more pages - make a conservative estimate
        // Since we don't know the total, estimate 10 pages minimum
        // This gives us a reasonable starting point that won't change too often
        estimatedTotalPages = 10; // Conservative estimate - will only update if we exceed this
      } else {
        // Only one page
        estimatedTotalPages = 1;
      }
      currentPagesCompleted = 0; // Reset for new sync
    } else {
      // For subsequent pages, use the existing estimate (don't change it)
      // Only increment pages_completed
    }
    
    // Increment pages_completed for this page
    currentPagesCompleted += 1;
    
    // Only update total_pages if we've exceeded our estimate AND there's still more pages
    // This prevents constant recalculation of the percentage
    if (listJson.nextPageToken && estimatedTotalPages !== null && currentPagesCompleted >= estimatedTotalPages) {
      // We've exceeded our estimate - add a conservative buffer (5 more pages)
      // This prevents the percentage from jumping around too much
      estimatedTotalPages = currentPagesCompleted + 5;
      console.log(`📊 Updated total_pages estimate to ${estimatedTotalPages} (completed ${currentPagesCompleted} pages, more pages remaining)`);
    }

    // --- NEW ---
    // Early exit if no threads and no next page
    if (threadIds.length === 0 && !listJson.nextPageToken) {
      // Mark as completed with final progress
      await updateJobStatus(jobId, 'completed', 'No threads found to sync.', estimatedTotalPages || 1, currentPagesCompleted);
      return new Response(JSON.stringify({ message: "No threads to process." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
    
    // Update progress (but don't update status if it's already running)
    await updateJobStatus(jobId, 'running', `Processing page ${currentPagesCompleted}${estimatedTotalPages ? ` of ${estimatedTotalPages}` : ''}...`, estimatedTotalPages, currentPagesCompleted);

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
      
      // --- NEW ---
      // Customer cache to avoid duplicate upserts within the same batch
      // Map<email, customer_id> - scoped to this batch processing
      const customerCache = new Map<string, string>();
      
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
                  // Check if company already exists before creating
                  const { data: existingCompany } = await supabaseAdmin
                    .from('companies')
                    .select('company_id, ai_insights')
                    .eq('domain_name', domain)
                    .eq('user_id', userId)
                    .maybeSingle();

                  const companyName = domain.split('.')[0].split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                  
                  const { data: company, error: companyError } = await supabaseAdmin.from('companies').upsert({
                    domain_name: domain,
                    company_name: companyName,
                    user_id: userId
                  }, {
                    onConflict: 'user_id, domain_name', // Your existing schema
                    ignoreDuplicates: false
                  }).select('company_id, domain_name').single();

                  if (companyError) throw companyError;
                  const companyId = company?.company_id; // This is UUID

                  // Trigger AI insights generation for newly created company (fire-and-forget)
                  // Only trigger if company was just created (not updated)
                  if (companyId && company && !existingCompany) {
                    triggerCompanyInsightsGeneration(companyId, company.domain_name, userId)
                      .catch(err => {
                        // Non-critical - don't fail company creation if this fails
                        console.error('Failed to trigger AI insights generation (non-critical):', err);
                      });
                  }

                  if (companyId) {
                    // Don't add to discoveredCompanyIds yet - wait until customer is confirmed
                    const senderName = fromHeader.includes(email) ? (fromHeader.split('<')[0].trim().replace(/"/g, '') || email) : email;

                    // --- NEW ---
                    // Check cache first to avoid duplicate upserts
                    let customerId: string | null = null;
                    
                    if (customerCache.has(email)) {
                      customerId = customerCache.get(email)!;
                      console.log(`📦 Using cached customer_id for ${email}: ${customerId}`);
                    } else {
                      // Try to fetch existing customer first to avoid duplicate key errors
                      // First check if customer exists for this company
                      const { data: existingCustomerCheck, error: fetchCheckError } = await supabaseAdmin
                        .from('customers')
                        .select('customer_id, company_id')
                        .eq('email', email)
                        .eq('company_id', companyId)
                        .single();
                      
                      if (!fetchCheckError && existingCustomerCheck) {
                        // Customer already exists for this company - use it
                        customerId = existingCustomerCheck.customer_id;
                        if (customerId) {
                          customerCache.set(email, customerId);
                          console.log(`✅ Found existing customer ${email} in database: ${customerId}`);
                        }
                      } else {
                        // Customer doesn't exist for this company - check if it exists for ANY company
                        // (because unique constraint is only on email, not company_id+email)
                        const { data: anyCompanyCustomer, error: anyCompanyError } = await supabaseAdmin
                          .from('customers')
                          .select('customer_id, company_id')
                          .eq('email', email)
                          .single();
                        
                        if (!anyCompanyError && anyCompanyCustomer) {
                          // Customer exists but for a different company
                          console.warn(`⚠️ Customer ${email} already exists for company ${anyCompanyCustomer.company_id}, but we're processing for company ${companyId}. Skipping to avoid duplicate key error.`);
                          // Skip this customer - can't create it due to unique constraint on email
                          continue;
                        }
                        
                        // Customer doesn't exist at all - attempt upsert with company_id for proper isolation
                        const { data: customer, error: customerError } = await supabaseAdmin
                          .from('customers')
                          .upsert(
                            {
                              email: email,
                              full_name: senderName,
                              company_id: companyId,
                            },
                            {
                              onConflict: 'company_id, email', // Updated to match new constraint
                              ignoreDuplicates: false,
                            }
                          )
                          .select('customer_id, company_id')
                          .single();

                      // --- IMPROVED ERROR HANDLING ---
                      if (customerError) {
                        // Check if it's a duplicate key error (code 23505)
                        // Check multiple ways the error might be structured
                        const errorCode = customerError.code || customerError?.code || String(customerError.code);
                        const errorMessage = customerError.message || String(customerError);
                        const errorString = JSON.stringify(customerError);
                        
                        const isDuplicateKeyError = 
                          errorCode === '23505' || 
                          errorCode === 23505 ||
                          errorCode === '23505' ||
                          String(errorCode) === '23505' ||
                          errorMessage?.includes('duplicate key') ||
                          errorMessage?.includes('already exists') ||
                          errorMessage?.includes('violates unique constraint') ||
                          errorString?.includes('23505') ||
                          errorString?.includes('duplicate key') ||
                          errorString?.includes('customers_email_key') ||
                          errorString?.includes('violates unique constraint');
                        
                        if (isDuplicateKeyError) {
                          console.warn(`⚠️ Duplicate key error detected for customer ${email}. Error details:`, {
                            code: errorCode,
                            message: errorMessage,
                            fullError: customerError
                          });
                          console.warn(`⚠️ Attempting to fetch existing customer for company ${companyId}...`);
                          
                          // Try to fetch existing customer for this company_id and email
                          const { data: existingCustomer, error: fetchError } = await supabaseAdmin
                            .from('customers')
                            .select('customer_id, company_id')
                            .eq('email', email)
                            .eq('company_id', companyId)
                            .single();
                          
                          if (fetchError || !existingCustomer) {
                            // Customer exists but for a different company - try to fetch without company_id filter
                            console.warn(`⚠️ Customer ${email} not found for company ${companyId}. Checking if it exists for another company...`);
                            
                            const { data: anyCustomer, error: anyFetchError } = await supabaseAdmin
                              .from('customers')
                              .select('customer_id, company_id')
                              .eq('email', email)
                              .single();
                            
                            if (anyCustomer) {
                              console.error(`❌ Customer ${email} exists but belongs to company ${anyCustomer.company_id}, not ${companyId}. This indicates the unique constraint should include company_id. Skipping this customer.`);
                              // Skip this customer but continue processing
                              continue;
                            } else {
                              // This shouldn't happen - duplicate key error but customer doesn't exist?
                              console.error(`❌ Duplicate key error for ${email} but customer not found in database. This is unexpected. Skipping.`);
                              continue;
                            }
                          }
                          
                          // Use the existing customer
                          customerId = existingCustomer.customer_id;
                          if (!customerId) {
                            console.error(`❌ Customer ID not found in existing customer data for ${email}`);
                            continue;
                          }
                          
                          // Verify it belongs to the correct company
                          if (existingCustomer.company_id && existingCustomer.company_id !== companyId) {
                            console.error(`❌ Customer ${email} belongs to company ${existingCustomer.company_id}, not ${companyId}. Skipping.`);
                            continue;
                          }
                          
                          // Add to cache for subsequent lookups
                          customerCache.set(email, customerId);
                          console.log(`✅ Found existing customer for ${email}: ${customerId}`);
                        } else {
                          // Other error - try one more time to fetch the customer before failing
                          console.warn(`⚠️ Upsert failed with non-duplicate-key error. Attempting to fetch customer as fallback...`);
                          const { data: fallbackCustomer, error: fallbackError } = await supabaseAdmin
                            .from('customers')
                            .select('customer_id, company_id')
                            .eq('email', email)
                            .eq('company_id', companyId)
                            .single();
                          
                          if (!fallbackError && fallbackCustomer) {
                            // Found it - use it
                            customerId = fallbackCustomer.customer_id;
                            if (customerId) {
                              customerCache.set(email, customerId);
                              console.log(`✅ Fallback fetch succeeded for ${email}: ${customerId}`);
                            } else {
                              console.error(`!!! FATAL: Failed to upsert customer ${email} for company ${companyId}. Error:`, customerError);
                              throw new Error(`Customer upsert failed: ${customerError.message || String(customerError)}`);
                            }
                          } else {
                            // Still not found - throw to fail the job
                            console.error(`!!! FATAL: Failed to upsert customer ${email} for company ${companyId}. Error:`, customerError);
                            throw new Error(`Customer upsert failed: ${customerError.message || String(customerError)}`);
                          }
                        }
                      } else {
                        // No error - check if customer data was returned
                        if (!customer) {
                          // This should not happen if the upsert is correct, but it's a good failsafe
                          throw new Error(`Customer data not returned for ${email} after upsert.`);
                        } else {
                          // Upsert succeeded - verify the customer belongs to this company
                          customerId = customer.customer_id;
                          if (!customerId) {
                            throw new Error(`Customer ID not found in returned data for ${email}. Customer data: ${JSON.stringify(customer)}`);
                          }
                          
                          // Verify company_id matches (important for data integrity)
                          if (customer.company_id && customer.company_id !== companyId) {
                            console.error(`⚠️ WARNING: Customer ${email} belongs to company ${customer.company_id}, but we're processing for company ${companyId}. This suggests a data integrity issue.`);
                            // Still use the customer_id, but log the warning
                          }
                          
                          console.log(`✅ Successfully upserted customer ${email} with customer_id: ${customerId}`);
                        }
                      }
                      
                      // Add to cache for subsequent lookups in this batch
                      if (customerId) {
                        customerCache.set(email, customerId);
                      }
                    }
                    
                    if (!customerId) {
                      console.error(`❌ Could not get customer_id for ${email}. Skipping.`);
                      continue;
                    }
                    
                    // Only add company to discoveredCompanyIds after customer is confirmed
                    discoveredCompanyIds.set(companyId, true);
                    discoveredCustomerIds.set(email, customerId);
                    
                    if (fromHeader.includes(email)) {
                      msgCustomerMap.set(msg.id, customerId); // Map this message to its sender
                    }
                  }
                }
                } catch (error) {
                  console.error(`Error in company/customer creation for ${email}:`, error);
                  
                  // Check if it's a duplicate key error - handle gracefully
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  const errorString = JSON.stringify(error);
                  const isDuplicateKeyError = 
                    errorMessage?.includes('duplicate key') ||
                    errorMessage?.includes('already exists') ||
                    errorMessage?.includes('violates unique constraint') ||
                    errorMessage?.includes('customers_email_key') ||
                    errorString?.includes('23505') ||
                    errorString?.includes('duplicate key') ||
                    errorString?.includes('customers_email_key');
                  
                  if (isDuplicateKeyError) {
                    console.warn(`⚠️ Duplicate key error caught in outer catch for ${email}. This should have been handled earlier. Skipping this customer.`);
                    // Skip this customer but continue processing
                    continue;
                  }
                  
                  // Re-throw other customer upsert errors to fail the job
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
          
          // --- REORDERED ---
          // First, prepare and add thread data BEFORE messages
          // This ensures thread is in threadsToStore even if an error occurs during message processing
          const firstMessage = messages[0];
          const subject = firstMessage.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          
          // Prepare thread data structure (summary will be added after summarization)
          const threadData = {
            thread_id: threadId,
            user_id: userId,
            subject: subject,
            snippet: threadJson.snippet,
            last_message_date: new Date(Number(lastMessage.internalDate)).toISOString(),
            llm_summary: null as any, // Will be set after summarization
            llm_summary_updated_at: null as string | null // Will be set after summarization
          };
          
          // Add thread to store FIRST - this ensures it's included even if summarization fails
          threadsToStore.push(threadData);

          // --- NEW ---
          // (Task 2.11) Prep Messages Loop: Create all message data objects
          // Only add messages that don't already exist (for existing threads)
          // Store messages in a local array first, then add to messagesToStore only if thread processing succeeds
          const threadMessages: any[] = [];
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
            threadMessages.push(msgData);
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
              console.log(`🔄 Incremental summarization: updating summary with ${newMessages.length} new message(s) for thread ${threadId}`);
              if (previousSummary && previousSummary.feature_requests) {
                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Previous summary has ${previousSummary.feature_requests.length} feature requests`);
              }
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
            
            // Log feature requests from incremental summarization
            if (isIncremental && summaryJson && !summaryJson.error) {
              const featureRequestCount = Array.isArray(summaryJson.feature_requests) ? summaryJson.feature_requests.length : 0;
              console.log(`🔍 [FEATURE_REQUEST_DEBUG] Incremental summary for thread ${threadId} returned ${featureRequestCount} feature requests`);
              if (featureRequestCount > 0) {
                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Incremental feature requests:`, JSON.stringify(summaryJson.feature_requests, null, 2));
              }
            }
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

          // Also update existing customer messages in the thread with the new sentiment_score
          // This ensures all messages in the thread have the same sentiment_score
          if (sentimentScore !== null) {
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
          // Extract and save feature requests from summaryJson
          if (summaryJson && !summaryJson.error && Array.isArray(summaryJson.feature_requests) && summaryJson.feature_requests.length > 0) {
            console.log(`🔍 [FEATURE_REQUEST_DEBUG] Raw feature_requests from LLM for thread ${threadId}:`, {
              count: summaryJson.feature_requests.length,
              rawData: JSON.stringify(summaryJson.feature_requests, null, 2)
            });

            // Map new format to old format using shared utility (supports backward compatibility)
            const featureRequests = mapFeatureRequests(summaryJson.feature_requests);

            console.log(`🔍 [FEATURE_REQUEST_DEBUG] Mapped feature requests for thread ${threadId}:`, {
              rawCount: summaryJson.feature_requests.length,
              mappedCount: featureRequests.length,
              mappedData: JSON.stringify(featureRequests, null, 2)
            });

            if (featureRequests.length > 0) {
              // Save feature requests for each company associated with the thread
              // Fetch all customers for all companies in a single query for efficiency
              const companyIdsArray = Array.from(discoveredCompanyIds.keys());
              const customerIdsArray = Array.from(discoveredCustomerIds.values());
              
              console.log(`🔍 [FEATURE_REQUEST_DEBUG] Company/Customer discovery for thread ${threadId}:`, {
                discoveredCompanyIdsCount: discoveredCompanyIds.size,
                discoveredCustomerIdsCount: discoveredCustomerIds.size,
                companyIdsArray: companyIdsArray,
                customerIdsArray: customerIdsArray
              });
              
              let companyCustomerMap = new Map<string, string>(); // Map<company_id, customer_id>
              
              if (companyIdsArray.length > 0) {
                // Fetch ANY customers that belong to the discovered companies
                // We don't require customer_id to be in discoveredCustomerIds because
                // a customer might exist for the company even if their email wasn't in thread headers
                const { data: customersData, error: customersError } = await supabaseAdmin
                  .from('customers')
                  .select('customer_id, company_id')
                  .in('company_id', companyIdsArray);
                
                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Customer lookup query:`, {
                  companyIds: companyIdsArray,
                  discoveredCustomerIds: customerIdsArray,
                  queryResult: customersData?.length || 0
                });
                
                if (customersError) {
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] Error fetching customers for thread ${threadId}:`, customersError);
                }
                
                if (customersData) {
                  console.log(`🔍 [FEATURE_REQUEST_DEBUG] Fetched ${customersData.length} customers for thread ${threadId}`);
                  
                  // Build a map of company_id -> first customer_id found
                  for (const customer of customersData) {
                    if (!companyCustomerMap.has(customer.company_id)) {
                      companyCustomerMap.set(customer.company_id, customer.customer_id);
                    }
                  }
                } else {
                  console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] No customers data returned for thread ${threadId}, companyIds: ${companyIdsArray.join(', ')}, customerIds: ${customerIdsArray.join(', ')}`);
                }
              } else {
                console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] Cannot build company-customer map for thread ${threadId}:`, {
                  companyIdsArrayLength: companyIdsArray.length,
                  customerIdsArrayLength: customerIdsArray.length
                });
              }

              console.log(`🔍 [FEATURE_REQUEST_DEBUG] Company-Customer mapping for thread ${threadId}:`, {
                companyCustomerMapSize: companyCustomerMap.size,
                mapping: Object.fromEntries(companyCustomerMap)
              });

              // Critical validation: Check if companies were discovered
              if (discoveredCompanyIds.size === 0) {
                console.error(`❌ [FEATURE_REQUEST_DEBUG] CRITICAL: No companies discovered for thread ${threadId} but feature requests exist!`);
                console.error(`❌ [FEATURE_REQUEST_DEBUG] Feature requests that will be lost:`, JSON.stringify(featureRequests, null, 2));
                console.error(`❌ [FEATURE_REQUEST_DEBUG] Thread messages count: ${messages.length}, discoveredCustomerIds: ${discoveredCustomerIds.size}`);
                
                // FALLBACK 1: Re-extract companies from thread messages (in case discovery loop had issues)
                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Attempting fallback: re-extracting companies from thread messages`);
                const fallbackEmails = new Set<string>();
                for (const msg of messages) {
                  const msgHeaders = msg.payload?.headers || [];
                  const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
                  const toHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
                  const ccHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
                  
                  const allHeaders = [fromHeader, toHeader, ccHeader];
                  for (const header of allHeaders) {
                    const emails = header.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
                    for (const email of emails) {
                      if (email !== userEmail) {
                        fallbackEmails.add(email);
                      }
                    }
                  }
                }
                
                // Try to find companies for these emails
                if (fallbackEmails.size > 0) {
                  const fallbackDomains = Array.from(fallbackEmails).map(e => e.split('@')[1]).filter(Boolean);
                  const uniqueDomains = [...new Set(fallbackDomains)];
                  
                  console.log(`🔍 [FEATURE_REQUEST_DEBUG] Found ${uniqueDomains.length} unique domains from thread: ${uniqueDomains.join(', ')}`);
                  
                  // Query for companies matching these domains
                  const { data: domainCompanies } = await supabaseAdmin
                    .from('companies')
                    .select('company_id, domain_name')
                    .eq('user_id', userId)
                    .in('domain_name', uniqueDomains)
                    .neq('status', 'archived')
                    .neq('status', 'deleted');
                  
                  if (domainCompanies && domainCompanies.length > 0) {
                    console.log(`✅ [FEATURE_REQUEST_DEBUG] Found ${domainCompanies.length} companies matching thread domains`);
                    for (const comp of domainCompanies) {
                      discoveredCompanyIds.set(comp.company_id, true);
                    }
                    
                    // Try to find customers for these companies
                    const fallbackCompanyIds = Array.from(discoveredCompanyIds.keys());
                    const { data: fallbackCustomers } = await supabaseAdmin
                      .from('customers')
                      .select('customer_id, company_id')
                      .in('company_id', fallbackCompanyIds);
                    
                    if (fallbackCustomers && fallbackCustomers.length > 0) {
                      for (const customer of fallbackCustomers) {
                        if (!companyCustomerMap.has(customer.company_id)) {
                          companyCustomerMap.set(customer.company_id, customer.customer_id);
                        }
                      }
                      console.log(`✅ [FEATURE_REQUEST_DEBUG] Found ${fallbackCustomers.length} customers for fallback companies`);
                    }
                    
                    // For companies without customers, create customers from fallbackEmails
                    for (const comp of domainCompanies) {
                      if (!companyCustomerMap.has(comp.company_id)) {
                        console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] Company ${comp.company_id} has no customers, creating one from thread emails`);
                        
                        // Find matching email for this company's domain
                        const matchingEmail = Array.from(fallbackEmails).find(e => e.split('@')[1] === comp.domain_name);
                        const emailToUse = matchingEmail || Array.from(fallbackEmails)[0];
                        
                        if (emailToUse) {
                          // Extract customer name from email headers if available
                          let customerName = emailToUse;
                          for (const msg of messages) {
                            const msgHeaders = msg.payload?.headers || [];
                            const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
                            if (fromHeader.includes(emailToUse)) {
                              const extractedName = fromHeader.split('<')[0].trim().replace(/"/g, '');
                              if (extractedName && extractedName !== emailToUse) {
                                customerName = extractedName;
                              }
                              break;
                            }
                          }
                          
                          const { data: newCustomer, error: customerError } = await supabaseAdmin
                            .from('customers')
                            .upsert({
                              email: emailToUse,
                              full_name: customerName,
                              company_id: comp.company_id
                            }, {
                              onConflict: 'company_id, email',
                              ignoreDuplicates: false
                            })
                            .select('customer_id')
                            .single();
                          
                          if (!customerError && newCustomer?.customer_id) {
                            companyCustomerMap.set(comp.company_id, newCustomer.customer_id);
                            console.log(`✅ [FEATURE_REQUEST_DEBUG] Created customer ${newCustomer.customer_id} (${customerName}) for existing company ${comp.company_id}`);
                          } else {
                            // Try to find existing customer after failed upsert (duplicate key scenario)
                            const { data: existingCustomer } = await supabaseAdmin
                              .from('customers')
                              .select('customer_id')
                              .eq('company_id', comp.company_id)
                              .eq('email', emailToUse)
                              .maybeSingle();
                            
                            if (existingCustomer?.customer_id) {
                              companyCustomerMap.set(comp.company_id, existingCustomer.customer_id);
                              console.log(`✅ [FEATURE_REQUEST_DEBUG] Found existing customer ${existingCustomer.customer_id} after upsert failure`);
                            } else {
                              console.error(`❌ [FEATURE_REQUEST_DEBUG] Failed to create/find customer for company ${comp.company_id}:`, customerError);
                            }
                          }
                        } else {
                          console.error(`❌ [FEATURE_REQUEST_DEBUG] No emails available to create customer for company ${comp.company_id}`);
                        }
                      }
                    }
                  } else {
                    // Companies don't exist yet - create them now from domains
                    console.log(`🔍 [FEATURE_REQUEST_DEBUG] Companies don't exist for domains, creating them now`);
                    for (const domain of uniqueDomains) {
                      try {
                        const companyName = domain.split('.')[0].split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                        const { data: newCompany, error: companyError } = await supabaseAdmin
                          .from('companies')
                          .upsert({
                            domain_name: domain,
                            company_name: companyName,
                            user_id: userId
                          }, {
                            onConflict: 'user_id, domain_name',
                            ignoreDuplicates: false
                          })
                          .select('company_id')
                          .single();
                        
                        if (!companyError && newCompany?.company_id) {
                          console.log(`✅ [FEATURE_REQUEST_DEBUG] Created company ${newCompany.company_id} for domain ${domain}`);
                          
                          // Try to find or create a customer for this company
                          const matchingEmail = Array.from(fallbackEmails).find(e => e.split('@')[1] === domain);
                          if (matchingEmail) {
                            // Extract customer name from email headers if available
                            let customerName = matchingEmail;
                            for (const msg of messages) {
                              const msgHeaders = msg.payload?.headers || [];
                              const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
                              if (fromHeader.includes(matchingEmail)) {
                                const extractedName = fromHeader.split('<')[0].trim().replace(/"/g, '');
                                if (extractedName && extractedName !== matchingEmail) {
                                  customerName = extractedName;
                                }
                                break;
                              }
                            }
                            
                            const { data: customer, error: customerError } = await supabaseAdmin
                              .from('customers')
                              .upsert({
                                email: matchingEmail,
                                full_name: customerName,
                                company_id: newCompany.company_id
                              }, {
                                onConflict: 'company_id, email',
                                ignoreDuplicates: false
                              })
                              .select('customer_id')
                              .single();
                            
                            if (!customerError && customer?.customer_id) {
                              // Only add company to discoveredCompanyIds after customer is confirmed
                              discoveredCompanyIds.set(newCompany.company_id, true);
                              companyCustomerMap.set(newCompany.company_id, customer.customer_id);
                              console.log(`✅ [FEATURE_REQUEST_DEBUG] Created customer ${customer.customer_id} (${customerName}) for company ${newCompany.company_id}`);
                            } else {
                              // Customer creation failed - try fallback approaches
                              console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] Customer creation failed for ${matchingEmail}, attempting fallbacks`);
                              
                              // Fallback 1: Try to find any existing customer for this company
                              const { data: existingCustomer } = await supabaseAdmin
                                .from('customers')
                                .select('customer_id')
                                .eq('company_id', newCompany.company_id)
                                .limit(1)
                                .maybeSingle();
                              
                              if (existingCustomer?.customer_id) {
                                discoveredCompanyIds.set(newCompany.company_id, true);
                                companyCustomerMap.set(newCompany.company_id, existingCustomer.customer_id);
                                console.log(`✅ [FEATURE_REQUEST_DEBUG] Found existing customer ${existingCustomer.customer_id} for company ${newCompany.company_id}`);
                              } else {
                                // Fallback 2: Create customer with first email from fallbackEmails (even if domain doesn't match exactly)
                                const firstEmail = Array.from(fallbackEmails)[0];
                                if (firstEmail) {
                                  console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] Creating customer with first available email ${firstEmail} for company ${newCompany.company_id}`);
                                  const fallbackCustomerName = firstEmail.split('@')[0].split('.').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                                  
                                  const { data: fallbackCustomer, error: fallbackError } = await supabaseAdmin
                                    .from('customers')
                                    .upsert({
                                      email: firstEmail,
                                      full_name: fallbackCustomerName,
                                      company_id: newCompany.company_id
                                    }, {
                                      onConflict: 'company_id, email',
                                      ignoreDuplicates: false
                                    })
                                    .select('customer_id')
                                    .single();
                                  
                                  if (!fallbackError && fallbackCustomer?.customer_id) {
                                    discoveredCompanyIds.set(newCompany.company_id, true);
                                    companyCustomerMap.set(newCompany.company_id, fallbackCustomer.customer_id);
                                    console.log(`✅ [FEATURE_REQUEST_DEBUG] Created fallback customer ${fallbackCustomer.customer_id} for company ${newCompany.company_id}`);
                                  } else {
                                    console.error(`❌ [FEATURE_REQUEST_DEBUG] All customer creation attempts failed for company ${newCompany.company_id}`);
                                  }
                                } else {
                                  console.error(`❌ [FEATURE_REQUEST_DEBUG] No emails available to create customer for company ${newCompany.company_id}`);
                                }
                              }
                            }
                          } else {
                            // No matching email found - use first email from fallbackEmails
                            const firstEmail = Array.from(fallbackEmails)[0];
                            if (firstEmail) {
                              console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] No exact domain match, creating customer with first available email ${firstEmail} for company ${newCompany.company_id}`);
                              const customerName = firstEmail.split('@')[0].split('.').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                              
                              const { data: fallbackCustomer, error: fallbackError } = await supabaseAdmin
                                .from('customers')
                                .upsert({
                                  email: firstEmail,
                                  full_name: customerName,
                                  company_id: newCompany.company_id
                                }, {
                                  onConflict: 'company_id, email',
                                  ignoreDuplicates: false
                                })
                                .select('customer_id')
                                .single();
                              
                              if (!fallbackError && fallbackCustomer?.customer_id) {
                                discoveredCompanyIds.set(newCompany.company_id, true);
                                companyCustomerMap.set(newCompany.company_id, fallbackCustomer.customer_id);
                                console.log(`✅ [FEATURE_REQUEST_DEBUG] Created customer ${fallbackCustomer.customer_id} with first email for company ${newCompany.company_id}`);
                              } else {
                                // Try to find any existing customer for this company
                                const { data: existingCustomer } = await supabaseAdmin
                                  .from('customers')
                                  .select('customer_id')
                                  .eq('company_id', newCompany.company_id)
                                  .limit(1)
                                  .maybeSingle();
                                
                                if (existingCustomer?.customer_id) {
                                  discoveredCompanyIds.set(newCompany.company_id, true);
                                  companyCustomerMap.set(newCompany.company_id, existingCustomer.customer_id);
                                  console.log(`✅ [FEATURE_REQUEST_DEBUG] Found existing customer ${existingCustomer.customer_id} for company ${newCompany.company_id}`);
                                } else {
                                  console.error(`❌ [FEATURE_REQUEST_DEBUG] Cannot create customer for company ${newCompany.company_id} - all attempts failed`);
                                }
                              }
                            } else {
                              console.error(`❌ [FEATURE_REQUEST_DEBUG] No emails available to create customer for company ${newCompany.company_id}`);
                            }
                          }
                        }
                      } catch (err) {
                        console.error(`❌ [FEATURE_REQUEST_DEBUG] Error creating company for domain ${domain}:`, err);
                      }
                    }
                  }
                }
                
                // FALLBACK 2: Try to find companies from thread_links table (if thread was previously processed)
                if (discoveredCompanyIds.size === 0) {
                  console.log(`🔍 [FEATURE_REQUEST_DEBUG] Still no companies, checking thread_company_link for thread ${threadId}`);
                  const { data: existingLinks } = await supabaseAdmin
                    .from('thread_company_link')
                    .select('company_id')
                    .eq('thread_id', threadId)
                    .eq('user_id', userId);
                  
                  if (existingLinks && existingLinks.length > 0) {
                    console.log(`✅ [FEATURE_REQUEST_DEBUG] Found ${existingLinks.length} existing thread_links, using those companies`);
                    for (const link of existingLinks) {
                      discoveredCompanyIds.set(link.company_id, true);
                    }
                    
                    // Try to find customers for these companies
                    const fallbackCompanyIds = Array.from(discoveredCompanyIds.keys());
                    const { data: fallbackCustomers } = await supabaseAdmin
                      .from('customers')
                      .select('customer_id, company_id')
                      .in('company_id', fallbackCompanyIds);
                    
                    if (fallbackCustomers && fallbackCustomers.length > 0) {
                      for (const customer of fallbackCustomers) {
                        if (!companyCustomerMap.has(customer.company_id)) {
                          companyCustomerMap.set(customer.company_id, customer.customer_id);
                        }
                      }
                      console.log(`✅ [FEATURE_REQUEST_DEBUG] Found ${fallbackCustomers.length} customers for thread_link companies`);
                    }
                  }
                }
                
                // Final check: If still no companies, this is a critical error
                if (discoveredCompanyIds.size === 0) {
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] CRITICAL: All fallbacks failed. Cannot save feature requests without a company.`);
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] This should not happen if thread has valid email addresses.`);
                }
              }

              // Save feature requests for each company
              let savedAnyFeatureRequests = false;
              for (const companyId of discoveredCompanyIds.keys()) {
                const customerIdForCompany = companyCustomerMap.get(companyId);

                // If no customer found for this company, try to find any customer for this company
                let finalCustomerId = customerIdForCompany;
                if (!finalCustomerId) {
                  console.warn(`⚠️ [FEATURE_REQUEST_DEBUG] No customer found in map for company ${companyId} in thread ${threadId}, attempting to find any customer for this company`);
                  
                  // Try to find any customer for this company (use maybeSingle to avoid errors)
                  const { data: anyCustomer, error: customerLookupError } = await supabaseAdmin
                    .from('customers')
                    .select('customer_id')
                    .eq('company_id', companyId)
                    .limit(1)
                    .maybeSingle();
                  
                  if (customerLookupError) {
                    console.error(`❌ [FEATURE_REQUEST_DEBUG] Error looking up customer for company ${companyId}:`, customerLookupError);
                  }
                  
                  if (anyCustomer && anyCustomer.customer_id) {
                    console.log(`✅ [FEATURE_REQUEST_DEBUG] Found customer ${anyCustomer.customer_id} for company ${companyId} via fallback query`);
                    finalCustomerId = anyCustomer.customer_id;
                    // Update the map for future iterations
                    companyCustomerMap.set(companyId, finalCustomerId);
                  } else {
                    console.error(`❌ [FEATURE_REQUEST_DEBUG] No customer found for company ${companyId} in thread ${threadId}, skipping feature request save for this company`);
                    console.error(`❌ [FEATURE_REQUEST_DEBUG] Company-Customer mapping state:`, {
                      companyId: companyId,
                      companyCustomerMapSize: companyCustomerMap.size,
                      companyCustomerMapEntries: Array.from(companyCustomerMap.entries()),
                      discoveredCustomerIds: Array.from(discoveredCustomerIds.entries()),
                      customerIdsArray: customerIdsArray
                    });
                    continue;
                  }
                }
                
                // Final validation: Ensure customer_id is valid before saving
                if (!finalCustomerId || typeof finalCustomerId !== 'string') {
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] Cannot save feature requests for company ${companyId}: invalid customer_id (${finalCustomerId})`);
                  continue;
                }

                // Save feature requests for this company/customer
                // IMPORTANT: Ensure thread exists in database before saving feature requests
                // This is necessary because threads are saved in batch later, but feature requests need the foreign key
                const { data: existingThread, error: threadCheckError } = await supabaseAdmin
                  .from('threads')
                  .select('thread_id')
                  .eq('thread_id', threadId)
                  .maybeSingle();

                if (threadCheckError) {
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] Error checking thread existence:`, threadCheckError);
                  console.error(`❌ [FEATURE_REQUEST_DEBUG] Skipping feature requests for thread ${threadId} due to thread check error`);
                  continue;
                }

                if (!existingThread) {
                  // Thread doesn't exist yet - find it in threadsToStore and save it immediately
                  const threadToSave = threadsToStore.find(t => t.thread_id === threadId);
                  
                  if (threadToSave) {
                    console.log(`🔍 [FEATURE_REQUEST_DEBUG] Thread ${threadId} not in database yet, saving it immediately before feature requests`);
                    
                    // Save thread immediately
                    const { error: threadSaveError, data: savedThread } = await supabaseAdmin
                      .from('threads')
                      .upsert(threadToSave, {
                        onConflict: 'thread_id',
                        ignoreDuplicates: false
                      })
                      .select('thread_id')
                      .single();

                    if (threadSaveError || !savedThread) {
                      console.error(`❌ [FEATURE_REQUEST_DEBUG] Failed to save thread ${threadId} immediately:`, threadSaveError);
                      console.error(`❌ [FEATURE_REQUEST_DEBUG] Skipping feature requests for thread ${threadId}`);
                      continue;
                    }

                    console.log(`✅ [FEATURE_REQUEST_DEBUG] Successfully saved thread ${threadId} immediately before feature requests`);
                  } else {
                    console.error(`❌ [FEATURE_REQUEST_DEBUG] Thread ${threadId} not found in threadsToStore and not in database. Cannot save feature requests.`);
                    continue;
                  }
                } else {
                  console.log(`✅ [FEATURE_REQUEST_DEBUG] Thread ${threadId} already exists in database`);
                }

                // Log thread_id details for debugging
                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Preparing to save feature requests for thread:`, {
                  threadId: threadId,
                  threadIdType: typeof threadId,
                  threadIdIsString: typeof threadId === 'string',
                  threadIdIsNull: threadId === null,
                  threadIdIsUndefined: threadId === undefined,
                  threadIdLength: threadId?.length,
                  companyId: companyId,
                  customerId: finalCustomerId,
                  featureRequestCount: featureRequests.length
                });

                const context = {
                  company_id: companyId,
                  customer_id: finalCustomerId,
                  source: 'thread' as const,
                  thread_id: threadId
                };

                console.log(`🔍 [FEATURE_REQUEST_DEBUG] Context object being passed:`, JSON.stringify(context, null, 2));

                const result = await saveFeatureRequests(
                  supabaseAdmin,
                  featureRequests,
                  context
                );

                if (result.success) {
                  console.log(`✅ Successfully saved ${result.savedCount} feature requests for thread ${threadId}, company ${companyId}`);
                  savedAnyFeatureRequests = true;
                } else {
                  console.warn(`⚠️ Saved ${result.savedCount} feature requests with ${result.errors.length} errors for thread ${threadId}, company ${companyId}`);
                  if (result.savedCount > 0) {
                    savedAnyFeatureRequests = true;
                  }
                }
              }
              
              // Final check: If we still haven't saved any feature requests, log critical error
              if (!savedAnyFeatureRequests && featureRequests.length > 0) {
                console.error(`❌ [FEATURE_REQUEST_DEBUG] CRITICAL: Failed to save any feature requests for thread ${threadId}!`);
                console.error(`❌ [FEATURE_REQUEST_DEBUG] Final state:`, {
                  discoveredCompanyIdsCount: discoveredCompanyIds.size,
                  companyCustomerMapSize: companyCustomerMap.size,
                  featureRequestsCount: featureRequests.length,
                  companyIds: Array.from(discoveredCompanyIds.keys()),
                  companyCustomerMapping: Object.fromEntries(companyCustomerMap)
                });
              }
            } else {
              console.log(`ℹ️ No valid feature requests found in thread ${threadId} (filtered out invalid entries)`);
            }
          } else if (summaryJson && !summaryJson.error) {
            console.log(`ℹ️ No feature requests found in thread ${threadId}`);
          }

          // --- UPDATED ---
          // Update thread data with summary (thread was already added to threadsToStore)
          const threadIndex = threadsToStore.findIndex(t => t.thread_id === threadId);
          if (threadIndex !== -1) {
            threadsToStore[threadIndex].llm_summary = summaryJson;
            threadsToStore[threadIndex].llm_summary_updated_at = new Date().toISOString();
          }

          // Update sentiment_score for messages in local array
          if (sentimentScore !== null) {
            for (let i = 0; i < threadMessages.length; i++) {
              const msg = threadMessages[i];
              // Only set sentiment_score for messages from customers (where customer_id is not null)
              if (msg.customer_id) {
                threadMessages[i] = {
                  ...msg,
                  sentiment_score: sentimentScore
                };
              }
            }
          }
          
          // Now add messages to messagesToStore (only after thread is successfully prepared)
          messagesToStore.push(...threadMessages);

          // Add links for this thread
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
          
          // Remove thread from threadsToStore if it was added (to prevent foreign key violations)
          const threadIndex = threadsToStore.findIndex(t => t.thread_id === threadId);
          if (threadIndex !== -1) {
            threadsToStore.splice(threadIndex, 1);
            console.log(`🗑️ Removed thread ${threadId} from batch due to processing error`);
          }
          
          // Remove messages for this thread from messagesToStore
          const initialMessageCount = messagesToStore.length;
          const filteredMessages = messagesToStore.filter(msg => msg.thread_id !== threadId);
          const removedMessageCount = initialMessageCount - filteredMessages.length;
          if (removedMessageCount > 0) {
            messagesToStore.length = 0;
            messagesToStore.push(...filteredMessages);
            console.log(`🗑️ Removed ${removedMessageCount} messages for thread ${threadId} from batch`);
          }
          
          // Remove links for this thread from linksToStore
          const initialLinkCount = linksToStore.length;
          const filteredLinks = linksToStore.filter(link => link.thread_id !== threadId);
          const removedLinkCount = initialLinkCount - filteredLinks.length;
          if (removedLinkCount > 0) {
            linksToStore.length = 0;
            linksToStore.push(...filteredLinks);
            console.log(`🗑️ Removed ${removedLinkCount} links for thread ${threadId} from batch`);
          }
          
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
      const { error: threadsError, data: insertedThreads } = await supabaseAdmin.from('threads').upsert(threadsToStore, {
        onConflict: 'thread_id',
        ignoreDuplicates: false
      }).select('thread_id');
      
      if (threadsError) {
        console.error("Database error saving threads:", threadsError);
        await updateJobStatus(jobId, 'failed', `Database error saving threads: ${threadsError.message}`);
        throw threadsError;
      }
      
      // Track which threads were successfully inserted
      const successfullyInsertedThreadIds = new Set<string>();
      if (insertedThreads && Array.isArray(insertedThreads)) {
        insertedThreads.forEach((t: any) => successfullyInsertedThreadIds.add(t.thread_id));
      } else {
        // Fallback: if select doesn't return data, assume all were inserted (upsert behavior)
        threadsToStore.forEach(t => successfullyInsertedThreadIds.add(t.thread_id));
      }
      
      console.log(`✅ Successfully inserted ${successfullyInsertedThreadIds.size} threads`);
      
      // Filter messages to only include those for successfully inserted threads
      const validMessages = messagesToStore.filter(msg => successfullyInsertedThreadIds.has(msg.thread_id));
      const invalidMessagesCount = messagesToStore.length - validMessages.length;
      
      if (invalidMessagesCount > 0) {
        console.warn(`⚠️ Filtered out ${invalidMessagesCount} messages for threads that were not successfully inserted`);
      }
      
      // Process next steps for each thread that has a summary with next steps
      for (const threadData of threadsToStore) {
        if (successfullyInsertedThreadIds.has(threadData.thread_id) && threadData.llm_summary && typeof threadData.llm_summary === 'object') {
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
      
      // Insert messages (only for successfully inserted threads)
      if (validMessages.length > 0) {
        const { error: messagesError } = await supabaseAdmin.from('thread_messages').upsert(validMessages, {
          onConflict: 'message_id',
          ignoreDuplicates: false
        });
        
        if (messagesError) {
          console.error("Database error saving messages:", messagesError);
          await updateJobStatus(jobId, 'failed', `Database error saving messages: ${messagesError.message}`);
          throw messagesError;
        }
        console.log(`✅ Successfully inserted ${validMessages.length} messages`);
      } else if (messagesToStore.length > 0) {
        console.warn(`⚠️ No valid messages to insert (all filtered out due to failed thread insertions)`);
      }
      
      // Insert links (only for successfully inserted threads)
      const validLinks = linksToStore.filter(link => successfullyInsertedThreadIds.has(link.thread_id));
      if (validLinks.length > 0) {
        const { error: linksError } = await supabaseAdmin.from('thread_company_link').upsert(validLinks, {
          onConflict: 'thread_id, company_id',
          ignoreDuplicates: true // Allow duplicates for links
        });
        
        if (linksError) {
          console.error("Database error saving links:", linksError);
          await updateJobStatus(jobId, 'failed', `Database error saving links: ${linksError.message}`);
          throw linksError;
        }
        console.log(`✅ Successfully inserted ${validLinks.length} thread-company links`);
      }
      
      console.log(`✅ Successfully saved batch data to database`);
    } else {
      console.log("⚠️ No new threads to save.");
    }

    // --- MODIFIED ---
    // Fire-and-forget recursive invocation to avoid timeout issues
    // The recursive call will handle its own errors and update job status independently
    if (listJson.nextPageToken) {
      // Check job status before invoking recursive call
      // If job is already failed, don't invoke next page
      const { data: jobStatusCheck } = await supabaseAdmin
        .from('sync_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
      
      if (jobStatusCheck?.status === 'failed') {
        console.warn(`⚠️ Job ${jobId} is already marked as failed. Skipping next page invocation.`);
        // Don't invoke - job has already failed
      } else {
        // Only log on first page to reduce noise
        if (!pageToken) {
          console.log(`📄 Processing multiple pages. Current page has ${listJson.threads?.length || 0} threads. Invoking next page (fire-and-forget)...`);
        } else {
          console.log(`📄 Chaining to next page (fire-and-forget)...`);
        }
        
        // Fire-and-forget: Don't await - let it run independently to avoid timeouts
        // The recursive call will handle its own errors and update job status
        supabaseAdmin.functions.invoke('sync-threads', {
          body: {
            jobId: jobId,
            provider_token,
            pageToken: listJson.nextPageToken
          }
        }).catch((invokeError: any) => {
          // Check if the error is expected (job already failed, early exit, or timeout)
          const errorMessage = invokeError?.message || String(invokeError);
          const errorContext = invokeError?.context || {};
          const errorStatus = errorContext?.status;
          const errorStatusText = errorContext?.statusText;
          
          // 504 Gateway Timeout is expected for fire-and-forget long-running operations
          // The recursive call will continue processing even if the invoke times out
          const isTimeout = errorStatus === 504 || 
                           errorStatusText === 'Gateway Timeout' ||
                           errorMessage.includes('504') ||
                           errorMessage.includes('Gateway Timeout') ||
                           errorMessage.includes('timeout');
          
          const isExpectedError = errorMessage.includes('already failed') || 
                                  errorMessage.includes('Job already failed') ||
                                  isTimeout;
          
          if (isExpectedError) {
            if (isTimeout) {
              console.log(`ℹ️ Recursive call invoke timed out (expected for fire-and-forget): The function will continue processing independently`);
            } else {
              console.log(`ℹ️ Recursive call exited early (expected): ${errorMessage}`);
            }
          } else {
            // Log actual errors but don't fail the parent function
            // The recursive call will handle its own errors
            console.error(`⚠️ Error invoking next page (non-blocking):`, invokeError);
            // Don't update job status here - let the recursive call handle it
            // This prevents race conditions where both parent and child try to update status
          }
        });
        
        // Return immediately - don't wait for the recursive call
        // This prevents timeout issues with long-running Gemini calls and rate limit retries
        console.log(`✅ Current page processed. Next page invoked asynchronously.`);
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
      
      // Final progress update: fetch latest progress values to ensure accuracy
      // Handle gracefully if progress columns don't exist
      let finalTotalPages: number | null = null;
      let finalPagesCompleted: number | null = null;
      try {
        const { data: finalJobData, error: finalProgressError } = await supabaseAdmin
          .from('sync_jobs')
          .select('total_pages, pages_completed')
          .eq('id', jobId)
          .single();
        
        if (!finalProgressError && finalJobData) {
          finalTotalPages = finalJobData?.total_pages || currentPagesCompleted || 1;
          finalPagesCompleted = finalJobData?.pages_completed || currentPagesCompleted || 1;
        } else {
          // If columns don't exist, use current values or defaults
          finalTotalPages = currentPagesCompleted || 1;
          finalPagesCompleted = currentPagesCompleted || 1;
        }
      } catch (err) {
        // Progress tracking columns may not exist - use current values
        finalTotalPages = currentPagesCompleted || 1;
        finalPagesCompleted = currentPagesCompleted || 1;
      }
      await updateJobStatus(jobId, 'completed', 'All threads have been synced.', finalTotalPages, finalPagesCompleted);
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

