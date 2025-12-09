// Stage 5: OpenAI summarization (async, non-blocking)
// Processes thread_summarization_queue jobs with parallel chunk processing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { formatThreadForLLM } from "../_shared/thread-processing-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CONCURRENCY = 3; // Reduced from 5 to 3 to prevent connection pool exhaustion (OpenAI rate limits also considered)

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      
      if (attempt >= maxRetries) {
        console.error(`❌ OpenAI API call failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      if (error?.code === 'rate_limit_exceeded') {
        console.warn(`⚠️ OpenAI rate limit hit (attempt ${attempt}/${maxRetries})`);
        
        let retryAfterMs = 2000;
        if (error.headers?.['retry-after-ms']) {
          retryAfterMs = parseInt(error.headers['retry-after-ms'], 10);
        } else if (error.message) {
          const match = error.message.match(/try again in ([\d.]+)s/i);
          if (match) {
            retryAfterMs = Math.ceil(parseFloat(match[1]) * 1000);
          }
        }
        
        const waitTime = retryAfterMs + 500;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exhausted');
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

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• Do not hallucinate or make up next steps

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

const mapPrompt = "You are an email analyst. Concisely summarize the key events, questions, and outcomes from this *part* of an email thread. This is an intermediate step; do not create a final report. Just state the facts of this chunk.\n\nChunk:\n";

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

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• Do not hallucinate or make up next steps

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues`;

async function processShortThread(script: string): Promise<any> {
  const userQuery = `Email Thread:\n\n${script}\n\nPlease analyze this thread and return the JSON summary.`;

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
    throw new Error("Invalid response from OpenAI.");
  }
}

async function processLongThread(chunks: string[]): Promise<any> {
  // Map: Process chunks in parallel
  const chunkSummaries: string[] = [];
  
  const chunkPromises = chunks.map(async (chunk) => {
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
    return completion.choices[0]?.message?.content || '';
  });

  const results = await Promise.allSettled(chunkPromises);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      chunkSummaries.push(result.value);
    }
  }

  if (chunkSummaries.length === 0) {
    throw new Error("Failed to summarize any chunks");
  }

  // Reduce: Combine summaries
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");
  const reduceQuery = `Intermediate Summaries:\n\n${combinedSummaries}\n\nPlease analyze these summaries and generate the final JSON report.`;

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
    throw new Error("Invalid response from OpenAI (reduce step).");
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('thread_summarization_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No threads to summarize' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          await supabaseAdmin
            .from('thread_summarization_queue')
            .update({
              status: 'processing',
              started_at: new Date().toISOString(),
              attempts: job.attempts + 1
            })
            .eq('id', job.id);

          let summary: any;

          if (job.requires_map_reduce && job.chunks_data?.chunks) {
            // Long thread: use map-reduce
            summary = await processLongThread(job.chunks_data.chunks);
          } else {
            // Short thread: format and process directly
            const script = formatThreadForLLM(job.messages, job.user_email);
            summary = await processShortThread(script);
          }

          // Update thread_processing_stages
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              stage_summarized: true,
              summarized_at: new Date().toISOString(),
              summary_data: summary,
              current_stage: 'completed',
              completed_at: new Date().toISOString(),
              summarize_error: null
            })
            .eq('id', job.thread_stage_id);

          // Get thread data from raw_thread_data to create/update thread
          const { data: stageData } = await supabaseAdmin
            .from('thread_processing_stages')
            .select('raw_thread_data, preprocessed_data')
            .eq('id', job.thread_stage_id)
            .single();

          const rawData = stageData?.raw_thread_data;
          const messages = rawData?.messages || [];
          const firstMessage = messages[0];
          const lastMessage = messages[messages.length - 1];
          const subject = firstMessage?.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';

          // Upsert thread with summary
          await supabaseAdmin
            .from('threads')
            .upsert({
              thread_id: job.thread_id,
              user_id: job.user_id,
              subject: subject,
              snippet: rawData?.snippet || '',
              last_message_date: new Date(Number(lastMessage?.internalDate || Date.now())).toISOString(),
              llm_summary: summary,
              llm_summary_updated_at: new Date().toISOString()
            }, {
              onConflict: 'thread_id',
              ignoreDuplicates: false
            });

          // Mark summarization job as completed
          await supabaseAdmin
            .from('thread_summarization_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              error_message: null
            })
            .eq('id', job.id);

          return { success: true, threadId: job.thread_id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const shouldRetry = job.attempts < job.max_attempts;

          await supabaseAdmin
            .from('thread_summarization_queue')
            .update({
              status: shouldRetry ? 'pending' : 'failed',
              error_message: errorMessage,
              attempts: job.attempts + 1
            })
            .eq('id', job.id);

          if (!shouldRetry) {
            // Mark thread stage as failed
            await supabaseAdmin
              .from('thread_processing_stages')
              .update({
                current_stage: 'failed',
                summarize_error: errorMessage
              })
              .eq('id', job.thread_stage_id);
          }

          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return new Response(JSON.stringify({
      processed: jobs.length,
      successful,
      failed
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Error in sync-threads-summarizer:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

