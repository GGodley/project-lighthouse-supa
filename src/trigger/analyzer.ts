import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

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

type GmailThreadData = {
  snippet?: string;
  messages?: GmailMessage[];
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
    const bodyText = bodies.text ?? null;
    const bodyHtml = bodies.html ?? null;

    let sentDateIso: string | null = null;
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

  // Update threads row with subject, snippet, and body
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

    try {
      // Step 0: ETL from raw_thread_data into threads + thread_messages
      await runThreadEtl(supabaseAdmin, userId, threadId);

      // Step 1: Process Entities (extract participants, create/link companies and customers)
      console.log(`Step 1: Processing entities for thread ${threadId}`);
      const processorResult = await python.runScript(
        "backend/services/processor.py",
        [userId, threadId]
      );

      console.log("Entity processor stdout:", processorResult.stdout);
      if (processorResult.stderr) {
        console.error("Entity processor stderr:", processorResult.stderr);
      }

      // Check if processor succeeded
      try {
        const processorData = JSON.parse(processorResult.stdout || "{}");
        if (!processorData.success) {
          throw new Error(
            `Entity processing failed: ${JSON.stringify(
              processorData.errors || []
            )}`
          );
        }
        console.log(
          `Entity processing completed: ${
            processorData.companies_created || 0
          } companies created, ${
            processorData.customers_created || 0
          } customers created`
        );
      } catch {
        // If stdout is not JSON, check exit code
        if (processorResult.exitCode !== 0) {
          throw new Error(
            `Entity processing failed with exit code ${processorResult.exitCode}`
          );
        }
      }

      // Step 2: Analyze Thread (AI analysis)
      console.log(`Step 2: Analyzing thread ${threadId}`);
      const analyzerResult = await python.runScript(
        "backend/services/analyzer.py",
        [userId, threadId]
      );

      console.log("Thread analyzer stdout:", analyzerResult.stdout);
      if (analyzerResult.stderr) {
        console.error("Thread analyzer stderr:", analyzerResult.stderr);
      }

      // Check if analyzer succeeded
      try {
        const analyzerData = JSON.parse(analyzerResult.stdout || "{}");
        if (!analyzerData.success) {
          throw new Error(
            `Thread analysis failed: ${JSON.stringify(
              analyzerData.errors || []
            )}`
          );
        }
      } catch {
        // If stdout is not JSON, check exit code
        if (analyzerResult.exitCode !== 0) {
          throw new Error(
            `Thread analysis failed with exit code ${analyzerResult.exitCode}`
          );
        }
      }

      return {
        success: true,
        processor: {
          stdout: processorResult.stdout,
          stderr: processorResult.stderr,
          exitCode: processorResult.exitCode,
        },
        analyzer: {
          stdout: analyzerResult.stdout,
          stderr: analyzerResult.stderr,
          exitCode: analyzerResult.exitCode,
        },
      };
    } catch (error) {
      console.error("Error executing pipeline:", error);
      throw error;
    }
  },
});

