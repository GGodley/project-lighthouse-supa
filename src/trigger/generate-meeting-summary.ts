import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for generate-meeting-summary");
  }
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Generate Meeting Summary Task - Analyzes meeting transcripts with LLM
 * 
 * Pattern: Follows analyzer.ts structure (fetch data, call Gemini, save results)
 * 
 * Flow:
 * 1. Receive transcript and meeting details from process-transcript Edge Function
 * 2. Extract participant names from transcript
 * 3. Call Gemini with generate-summary prompt
 * 4. Parse JSON response
 * 5. Save LLM summary to meetings.meeting_llm_summary
 * 6. Update related fields (customer_sentiment, sentiment_score, summary, next_steps)
 */
export const generateMeetingSummaryTask = task({
  id: "generate-meeting-summary",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true,
  },
  run: async (payload: {
    meetingId: string; // meetings.id as string (BIGINT)
    googleEventId: string;
    transcript: string;
    userId: string;
  }) => {
    const { meetingId, googleEventId, transcript } = payload;

    console.log(
      `🔄 Generating summary for meeting: ${meetingId} (${googleEventId})`
    );

    // Initialize Supabase client
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    const genAI = getGeminiClient();

    try {
      // Step 1: Fetch meeting details for context
      const { data: meeting, error: meetingError } = await supabaseAdmin
        .from("meetings")
        .select("title, meeting_url, customer_id, company_id")
        .eq("id", parseInt(meetingId))
        .maybeSingle();

      if (meetingError) {
        throw new Error(`Failed to fetch meeting: ${meetingError.message}`);
      }

      if (!meeting) {
        throw new Error(`Meeting ${meetingId} not found`);
      }

      const meetingTitle = meeting.title || meeting.meeting_url || "Meeting";

      // Step 2: Extract participant names from transcript
      // Transcript format: "Speaker Name: text\n\nSpeaker Name: text"
      const attendees = new Set<string>();
      const transcriptLines = transcript.split("\n\n");
      for (const line of transcriptLines) {
        const match = line.match(/^([^:]+):/);
        if (match) {
          attendees.add(match[1].trim());
        }
      }
      const attendeeList = Array.from(attendees).join(", ");

      console.log(
        `📝 Context: Title='${meetingTitle}', Attendees='${attendeeList}'`
      );

      // Step 3: Construct AI Prompt (matching generate-summary Edge Function)
      const prompt = `You are an expert Customer Success Manager assistant.
Your task is to analyze a customer meeting transcript and provide a structured summary, key action items, and a detailed sentiment analysis.

Context:
- Meeting Title/URL: ${meetingTitle}
- Meeting Attendees: ${attendeeList}

Meeting Transcript:
"""
${transcript}
"""

Instructions:
Generate a response as a valid JSON object. The customer's sentiment is the most important part.
Analyze the customer's words, tone, and feedback to determine their sentiment.

Sentiment Categories & Scores:
- "Very Positive" (Score: 3): Enthusiastic, explicit praise, clear plans for expansion.
- "Positive" (Score: 2): Satisfied, complimentary, minor issues resolved, optimistic.
- "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise.
- "Negative" (Score: -2): Frustrated, confused, mentioned blockers, unhappy with a feature or price.
- "Frustrated" (Score: -3): Explicitly angry, threatening to churn, multiple major issues.

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

Response Format:
Return a valid JSON object with exactly five keys:

"discussion_points": A string containing a concise summary of the main topics.

"action_items": An array of objects, each with the following structure:
[
  {
    "text": "Action item description",
    "owner": "Name or email of person responsible (or null if not mentioned)",
    "due_date": "YYYY-MM-DD or null if not mentioned"
  }
]
CRITICAL: Only extract action items that are EXPLICITLY mentioned in the conversation. Do NOT create or infer action items if they are not clearly stated. If no action items are mentioned, return an empty array [].

"sentiment": A single string phrase chosen from the Sentiment Categories above (e.g., "Positive", "Negative").

"sentiment_score": The numeric score (e.g., 2, -2) that corresponds to the chosen sentiment.

"feature_requests": An array of objects. Each object must have these keys:
  - "title": A brief name that represents the feature conceptually (e.g., "Bulk User Editing", "API Export for Reports")
  - "customer_description": A 1–2 sentence summary of what the customer is asking for, in your own words
  - "use_case": Why the customer wants it; what problem they are trying to solve
  - "urgency": A string chosen from the Urgency levels ('Low', 'Medium', 'High')
  - "urgency_signals": Quote or paraphrase the phrasing that indicates priority
  - "customer_impact": Who is affected and how (1 sentence)
If no feature requests are found, return an empty array [].`;

      // Step 4: Call Gemini API
      console.log("🤖 Sending prompt to Gemini...");
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const result = await model.generateContent(prompt);
      const responseContent = result.response.text();
      if (!responseContent) {
        throw new Error("Empty response from Gemini");
      }

      console.log("✅ Received response from Gemini");

      // Step 5: Parse JSON response
      let analysisResult: {
        discussion_points?: string;
        action_items?: Array<{
          text: string;
          owner: string | null;
          due_date: string | null;
        }>;
        sentiment?: string;
        sentiment_score?: number;
        feature_requests?: Array<{
          title: string;
          customer_description: string;
          use_case: string;
          urgency: string;
          urgency_signals: string;
          customer_impact: string;
        }>;
      };

      try {
        analysisResult = JSON.parse(responseContent);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Gemini response as JSON: ${parseError}`
        );
      }

      // Step 6: Update meetings table with LLM summary
      const { error: updateError } = await supabaseAdmin
        .from("meetings")
        .update({
          meeting_llm_summary: analysisResult,
          customer_sentiment: analysisResult.sentiment || null,
          sentiment_score: analysisResult.sentiment_score || null,
          summary: analysisResult.discussion_points || null,
          next_steps:
            analysisResult.action_items && analysisResult.action_items.length > 0
              ? analysisResult.action_items
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", parseInt(meetingId));

      if (updateError) {
        throw new Error(`Failed to update meeting: ${updateError.message}`);
      }

      console.log(`✅ Updated meeting with LLM summary`);

      // Step 7: Update company health score
      // Get company_id from meeting (or from customer if meeting.company_id is null)
      let companyId = meeting.company_id;
      
      if (!companyId && meeting.customer_id) {
        // Fallback: Get company_id from customer
        const { data: customerData } = await supabaseAdmin
          .from("customers")
          .select("company_id")
          .eq("customer_id", meeting.customer_id)
          .maybeSingle();
        
        if (customerData?.company_id) {
          companyId = customerData.company_id;
        }
      }

      if (companyId) {
        console.log(`[LOG] Updating health score for company: ${companyId}`);
        try {
          const { error: healthScoreError } = await supabaseAdmin.rpc(
            "recalculate_company_health_score",
            { target_company_id: companyId }
          );

          if (healthScoreError) {
            console.error(
              `⚠️  Failed to update company health score: ${healthScoreError.message}`
            );
            // Don't fail the task - health score update is non-critical
          } else {
            console.log(`✅ Updated company health score for company: ${companyId}`);
          }
        } catch (error) {
          console.error(
            `⚠️  Error updating company health score:`,
            error instanceof Error ? error.message : String(error)
          );
          // Don't fail the task - health score update is non-critical
        }
      } else {
        console.log(
          `ℹ️  Skipping health score update: No company_id found for meeting ${meetingId}`
        );
      }

      return {
        ok: true,
        meetingId,
        processed: true,
        summary: analysisResult.discussion_points,
        sentiment: analysisResult.sentiment,
        sentimentScore: analysisResult.sentiment_score,
        actionItemsCount: analysisResult.action_items?.length || 0,
        featureRequestsCount: analysisResult.feature_requests?.length || 0,
      };
    } catch (error) {
      console.error(
        `❌ Error generating summary for meeting ${meetingId}:`,
        error
      );

      // Update meeting with error (optional - don't fail the webhook)
      await supabaseAdmin
        .from("meetings")
        .update({
          error_details: {
            type: "llm_analysis_failed",
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
          last_error_at: new Date().toISOString(),
        })
        .eq("id", parseInt(meetingId));

      // Re-throw to trigger retry
      throw error;
    }
  },
});

