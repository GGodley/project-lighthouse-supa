import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { htmlToText } from "html-to-text";
import type { LLMSummary } from "../lib/types/threads";

// --- Types for Gmail thread JSON and ETL ---

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessagePayload = {
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePayload;
};


type ThreadMessageUpsert = {
  message_id: string;
  thread_id: string;
  user_id: string;
  customer_id: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  sent_date: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
};

type NextStepInsert = {
  thread_id: string;
  user_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  status: "pending";
};

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for analyzer");
  }
  return new OpenAI({ apiKey });
};

const parseDueDate = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
};

// --- Gmail parsing helpers (ported from Supabase edge function) ---

const decodeBase64Url = (data: string | undefined): string | undefined => {
  if (!data) return undefined;

  try {
    let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    const buffer = Buffer.from(base64, "base64");
    return buffer.toString("utf8");
  } catch (e) {
    console.error("Base64 decoding failed for data chunk.", e);
    return undefined;
  }
};

const collectBodies = (
  payload: GmailMessagePayload | undefined
): { text?: string; html?: string } => {
  let text: string | undefined;
  let html: string | undefined;

  const visitPart = (part: GmailMessagePart | undefined) => {
    if (!part) return;

    if (part?.body?.data) {
      const mimeType = part.mimeType || "";
      const decodedData = decodeBase64Url(part.body.data);

      if (decodedData) {
        if (mimeType === "text/plain" && !text) {
          text = decodedData;
        }
        if (mimeType === "text/html" && !html) {
          html = decodedData;
        }
      }
    }

    if (part?.parts && Array.isArray(part.parts)) {
      for (const child of part.parts) {
        visitPart(child);
      }
    }
  };

  if (payload) {
    visitPart(payload);
  }

  return { text, html };
};

const getHeader = (
  headers: GmailHeader[] | undefined,
  name: string
): string | undefined => {
  if (!headers || !Array.isArray(headers)) return undefined;
  const lower = name.toLowerCase();
  const header = headers.find(
    (h) => typeof h.name === "string" && h.name.toLowerCase() === lower
  );
  return header?.value;
};

const runThreadEtl = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
  threadId: string
) => {
  console.log(
    `ETL: Starting Gmail parsing for thread ${threadId} (user: ${userId})`
  );

  // Fetch raw thread data
  const { data: threadRow, error: threadFetchError } = await supabaseAdmin
    .from("threads")
    .select("thread_id, user_id, subject, snippet, body, raw_thread_data")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (threadFetchError) {
    throw new Error(
      `ETL: Failed to fetch thread ${threadId}: ${threadFetchError.message}`
    );
  }

  if (!threadRow) {
    throw new Error(`ETL: Thread ${threadId} not found for user ${userId}`);
  }

  const rawThreadData = threadRow.raw_thread_data;

  if (!rawThreadData || typeof rawThreadData !== "object") {
    throw new Error(
      `ETL: Missing or invalid raw_thread_data for thread ${threadId}`
    );
  }

  const messages: GmailMessage[] = Array.isArray(rawThreadData.messages)
    ? rawThreadData.messages!
    : [];

  if (messages.length === 0) {
    console.log(`ETL: No messages found in raw_thread_data for ${threadId}`);
  } else {
    console.log(
      `ETL: Found ${messages.length} messages in raw_thread_data for ${threadId}`
    );
  }

  // Derive subject and snippet
  let subject: string | null = threadRow.subject ?? null;
  const snippet: string | null =
    threadRow.snippet ??
    rawThreadData.snippet ??
    messages[0]?.snippet ??
    null;

  if (!subject && messages.length > 0) {
    const firstHeaders = messages[0]?.payload?.headers ?? [];
    subject = getHeader(firstHeaders, "subject") || "No Subject";
  }

  // Parse messages and build thread body + bulk upsert payload
  const messagesToUpsert: ThreadMessageUpsert[] = [];
  const transcriptParts: string[] = [];
  let lastMessageDate: string | null = null;

  for (const msg of messages) {
    const payload = msg.payload;
    const headers = payload?.headers;

    const fromAddress = getHeader(headers, "from") ?? null;
    const toValue = getHeader(headers, "to") ?? "";
    const ccValue = getHeader(headers, "cc") ?? "";

    const toAddresses = toValue
      ? toValue.split(",").map((e) => e.trim()).filter(Boolean)
      : [];
    const ccAddresses = ccValue
      ? ccValue.split(",").map((e) => e.trim()).filter(Boolean)
      : [];

    const bodies = collectBodies(payload);
    let bodyText = bodies.text ?? null;
    const bodyHtml = bodies.html ?? null;

    // If no plain text but HTML exists, derive text from HTML
    if (!bodyText && bodyHtml) {
      try {
        bodyText = htmlToText(bodyHtml, {
          wordwrap: 120,
        });
      } catch (e) {
        console.warn("ETL: Failed to convert HTML to text", e);
      }
    }

    let sentDateIso: string | null = null;
    // STRICT: use Gmail internalDate only
    if (msg.internalDate) {
      const ms = Number(msg.internalDate);
      if (!Number.isNaN(ms)) {
        sentDateIso = new Date(ms).toISOString();
        if (!lastMessageDate || sentDateIso > lastMessageDate) {
          lastMessageDate = sentDateIso;
        }
      }
    }

    const messageSnippet = msg.snippet ?? null;

    messagesToUpsert.push({
      message_id: msg.id,
      thread_id: threadId,
      user_id: userId,
      customer_id: null,
      from_address: fromAddress,
      to_addresses: toAddresses.length > 0 ? toAddresses : null,
      cc_addresses: ccAddresses.length > 0 ? ccAddresses : null,
      sent_date: sentDateIso,
      snippet: messageSnippet,
      body_text: bodyText,
      body_html: bodyHtml,
    });

    const transcriptBody = bodyText || bodyHtml;
    if (transcriptBody) {
      const senderLabel = fromAddress || "Unknown sender";
      transcriptParts.push(`${senderLabel}: ${transcriptBody}`);
    }
  }

  const flattenedBody =
    transcriptParts.length > 0 ? transcriptParts.join("\n\n") : null;

  // Update threads row with subject, snippet, body, and last_message_date
  const threadUpdatePayload: {
    subject: string | null;
    snippet: string | null;
    body: string | null;
    last_message_date?: string | null;
  } = {
    subject: subject ?? null,
    snippet,
    body: flattenedBody,
  };

  if (lastMessageDate) {
    threadUpdatePayload.last_message_date = lastMessageDate;
  }

  const { error: threadUpdateError } = await supabaseAdmin
    .from("threads")
    .update(threadUpdatePayload)
    .eq("thread_id", threadId)
    .eq("user_id", userId);

  if (threadUpdateError) {
    throw new Error(
      `ETL: Failed to update threads row for ${threadId}: ${threadUpdateError.message}`
    );
  }

  console.log(
    `ETL: Updated threads row for ${threadId} (subject, snippet, body${
      lastMessageDate ? ", last_message_date" : ""
    })`
  );

  // Bulk upsert thread_messages
  if (messagesToUpsert.length > 0) {
    const { error: messagesUpsertError } = await supabaseAdmin
      .from("thread_messages")
      .upsert(messagesToUpsert, { onConflict: "message_id" });

    if (messagesUpsertError) {
      throw new Error(
        `ETL: Failed to upsert thread_messages for ${threadId}: ${messagesUpsertError.message}`
      );
    }

    console.log(
      `ETL: Upserted ${messagesToUpsert.length} messages for thread ${threadId}`
    );
  } else {
    console.log(
      `ETL: No messages to upsert for thread ${threadId} (messages array empty)`
    );
  }
};

export const analyzeThreadTask = task({
  id: "analyze-thread",
  run: async (payload: { userId: string; threadId: string }) => {
    const { userId, threadId } = payload;

    console.log(
      `Starting full pipeline for thread ${threadId} (user: ${userId})`
    );

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
      supabaseServiceKey
    );

    const openai = getOpenAIClient();

    try {
      // Step 0: ETL from raw_thread_data into threads + thread_messages
      await runThreadEtl(supabaseAdmin, userId, threadId);

      // Step 1: Fetch normalized thread with body and existing summary
      const { data: threadRow, error: threadError } = await supabaseAdmin
        .from("threads")
        .select("thread_id, user_id, body, llm_summary, last_message_date")
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .maybeSingle();

      if (threadError) {
        throw new Error(
          `Analyzer: Failed to fetch thread ${threadId}: ${threadError.message}`
        );
      }
      if (!threadRow) {
        throw new Error(
          `Analyzer: Thread ${threadId} not found for user ${userId}`
        );
      }

      const body: string | null = threadRow.body;
      const existingSummary =
        threadRow.llm_summary as LLMSummary | { error: string } | null;

      type AnalysisScenario = "fresh" | "update";

      const isFresh =
        !existingSummary ||
        (typeof existingSummary === "object" &&
          "error" in existingSummary &&
          !!existingSummary.error);

      const scenario: AnalysisScenario = isFresh ? "fresh" : "update";

      let userPrompt: string;
      if (scenario === "fresh") {
        userPrompt = `
Analyze this full thread history. Provide a comprehensive summary and identify all open next steps.

Full Thread Transcript:
${body ?? "(no body available)"}
        `.trim();
      } else {
        userPrompt = `
You are updating an existing analysis.

Context: Previous Summary (JSON):
${JSON.stringify(existingSummary)}

Input: Full Thread Body:
${body ?? "(no body available)"}

Task:
1. Update the summary to incorporate the new information.
2. Generate Next Steps ONLY based on the new developments in the latest messages. Ignore older steps if they are now resolved.
3. Return a single JSON object matching the existing summary schema, including a 'next_steps' array if there are any new next steps.
        `.trim();
      }

      // Step 2: Call OpenAI in JSON mode
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a B2B customer success assistant. You summarize email threads and extract structured next steps for CSMs. Always respond with valid JSON only.",
          },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        throw new Error("Analyzer: OpenAI returned empty content");
      }

      let parsedSummary: LLMSummary | { error: string };
      try {
        parsedSummary = JSON.parse(rawContent);
      } catch (e) {
        parsedSummary = {
          error: `Failed to parse LLM JSON: ${(e as Error).message}`,
        };
      }

      const nowIso = new Date().toISOString();

      // Step 3: Update threads.llm_summary + last_analyzed_at
      const { error: summaryUpdateError } = await supabaseAdmin
        .from("threads")
        .update({
          llm_summary: parsedSummary,
          last_analyzed_at: nowIso,
        })
        .eq("thread_id", threadId)
        .eq("user_id", userId);

      if (summaryUpdateError) {
        throw new Error(
          `Analyzer: Failed to update llm_summary for ${threadId}: ${summaryUpdateError.message}`
        );
      }

      // Step 4: Manual next_steps dedup + insert
      // Type guard to check if parsedSummary is a valid LLMSummary with next_steps
      const isValidSummary = (
        summary: LLMSummary | { error: string } | null
      ): summary is LLMSummary => {
        return (
          summary !== null &&
          typeof summary === "object" &&
          !("error" in summary) &&
          "next_steps" in summary
        );
      };

      const nextStepsRaw = isValidSummary(parsedSummary)
        ? parsedSummary.next_steps
        : undefined;

      if (Array.isArray(nextStepsRaw) && nextStepsRaw.length > 0) {
        // Fetch existing next_steps for this thread
        const { data: existingSteps, error: existingStepsError } =
          await supabaseAdmin
            .from("next_steps")
            .select("description")
            .eq("thread_id", threadId)
            .eq("user_id", userId);

        if (existingStepsError) {
          throw new Error(
            `Analyzer: Failed to fetch existing next_steps for ${threadId}: ${existingStepsError.message}`
          );
        }

        const existingSet = new Set<string>();
        for (const row of existingSteps ?? []) {
          const desc = (row as { description: string | null }).description;
          if (!desc) continue;
          const normalized = desc.trim().toLowerCase();
          if (normalized) existingSet.add(normalized);
        }

        const nextStepsToInsert: NextStepInsert[] = [];
        for (const step of nextStepsRaw) {
          const description =
            typeof step?.text === "string" ? step.text.trim() : "";
          if (!description) continue;

          const normalized = description.toLowerCase();
          if (existingSet.has(normalized)) {
            // Duplicate, skip
            continue;
          }

          existingSet.add(normalized);

          const owner =
            typeof step?.owner === "string" && step.owner.trim()
              ? step.owner.trim()
              : null;
          const dueDate = parseDueDate(step?.due_date);

          nextStepsToInsert.push({
            thread_id: threadId,
            user_id: userId,
            description,
            owner,
            due_date: dueDate,
            status: "pending",
          });
        }

        if (nextStepsToInsert.length > 0) {
          const { error: nextStepsInsertError } = await supabaseAdmin
            .from("next_steps")
            .insert(nextStepsToInsert);

          if (nextStepsInsertError) {
            throw new Error(
              `Analyzer: Failed to insert next_steps for ${threadId}: ${nextStepsInsertError.message}`
            );
          }

          console.log(
            `Analyzer: Inserted ${nextStepsToInsert.length} next_steps for thread ${threadId}`
          );
        } else {
          console.log(
            `Analyzer: No new next_steps to insert for thread ${threadId} (all duplicates or empty)`
          );
        }
      } else {
        console.log(
          `Analyzer: No next_steps returned by LLM for thread ${threadId}`
        );
      }

      return {
        success: true,
        scenario,
        threadId,
        userId,
      };
    } catch (error) {
      console.error("Error executing analyzer pipeline:", error);
      throw error;
    }
  },
});

