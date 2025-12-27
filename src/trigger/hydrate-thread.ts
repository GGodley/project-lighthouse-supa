import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { analyzeThreadTask } from "./analyzer";
import { htmlToText } from "html-to-text";

// Types
type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
  filename?: string;
};

type GmailMessagePayload = {
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePayload;
};

type GmailThread = {
  id: string;
  historyId?: string;
  history_id?: string;
  messages?: GmailMessage[];
};

export interface HydrateThreadInput {
  userId: string;
  threadId: string;
  incomingHistoryId: string;
  reason: "initial_sync" | "incremental_sync" | "retry" | "manual";
}

export interface HydrateThreadResult {
  ok: boolean;
  userId: string;
  threadId: string;
  gmailMessageCount: number;
  newMessagesStored: number;
  skippedMessages: number;
  reasonCounts: {
    calendar_invite?: number;
    no_reply?: number;
  };
  analysisTriggered: boolean;
  lastMessageDate?: string;
}

// Helper functions
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

const getPartBodies = (
  payload: GmailMessagePayload | undefined
): { text?: string; html?: string; hasCalendar?: boolean } => {
  let text: string | undefined;
  let html: string | undefined;
  let hasCalendar = false;

  const visitPart = (part: GmailMessagePart | undefined) => {
    if (!part) return;

    const mimeType = part.mimeType || "";

    // Check for calendar
    if (mimeType === "text/calendar" || part.filename?.endsWith(".ics")) {
      hasCalendar = true;
    }

    if (part?.body?.data) {
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
    
    // Fallback: If no body was found in parts, check payload.body.data directly
    if (!text && !html && payload.body?.data) {
      const decodedData = decodeBase64Url(payload.body.data);
      if (decodedData) {
        text = decodedData;
      }
    }
  }

  return { text, html, hasCalendar };
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

const extractEmailFromAddress = (address: string | null | undefined): string | null => {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  // Check if address contains <email>
  if (trimmed.includes("<") && trimmed.includes(">")) {
    const start = trimmed.indexOf("<") + 1;
    const end = trimmed.indexOf(">");
    if (start > 0 && end > start) {
      return trimmed.substring(start, end).trim().toLowerCase();
    }
  }

  // Try regex match for email pattern
  const emailMatch = trimmed.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    return emailMatch[0].toLowerCase();
  }

  // Otherwise, return the address as-is if it looks like an email
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  return null;
};

const extractEmails = (headerValue: string | null | undefined): string[] => {
  const emails: string[] = [];
  if (!headerValue) return emails;

  // Split by comma and process each part
  const parts = headerValue.split(",");
  for (const part of parts) {
    const email = extractEmailFromAddress(part);
    if (email) {
      emails.push(email);
    }
  }

  // Dedupe
  return Array.from(new Set(emails));
};

const isCalendarInvite = (message: GmailMessage): boolean => {
  const payload = message.payload;
  if (!payload) return false;

  // Check headers
  const headers = payload.headers || [];
  const contentType = getHeader(headers, "Content-Type");
  if (contentType?.includes("text/calendar")) {
    return true;
  }

  const busyStatus = getHeader(headers, "X-MICROSOFT-CDO-BUSYSTATUS");
  if (busyStatus) {
    return true;
  }

  // Check parts for calendar mimeType or .ics filename
  const { hasCalendar } = getPartBodies(payload);
  return hasCalendar || false;
};

const isNoReplySender = (fromAddress: string | null | undefined): boolean => {
  if (!fromAddress) return false;
  const email = extractEmailFromAddress(fromAddress);
  if (!email) return false;

  const lowerEmail = email.toLowerCase();
  const noReplyPatterns = [
    "no-reply",
    "noreply",
    "donotreply",
    "mailer-daemon",
    "notification@",
    "automated@",
  ];

  return noReplyPatterns.some((pattern) => lowerEmail.includes(pattern));
};

const cleanHtml = (html: string, maxSize: number = 200 * 1024): string => {
  let cleaned = html;

  // Remove script tags
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove style tags
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove meta tags
  cleaned = cleaned.replace(/<meta[^>]*>/gi, "");

  // Remove link tags
  cleaned = cleaned.replace(/<link[^>]*>/gi, "");

  // Remove tracking pixels (img with width=1 or height=1)
  cleaned = cleaned.replace(/<img[^>]*(width=["']?1["']?|height=["']?1["']?)[^>]*>/gi, "");

  // Truncate if too large
  if (cleaned.length > maxSize) {
    cleaned = cleaned.substring(0, maxSize) + "<!-- truncated -->";
  }

  return cleaned;
};

export const hydrateThreadTask = task({
  id: "hydrate-thread",
  run: async (payload: HydrateThreadInput): Promise<HydrateThreadResult> => {
    const { userId, threadId, incomingHistoryId, reason } = payload;

    console.log(`🔄 Starting hydrate-thread for user: ${userId}, thread: ${threadId}, reason: ${reason}`);

    // Initialize Supabase client with service role key
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

    try {
      // Step 1: Check existing thread for history ID
      const { data: threadRow, error: threadError } = await supabaseAdmin
        .from("threads")
        .select("history_id")
        .eq("user_id", userId)
        .eq("thread_id", threadId)
        .maybeSingle();

      if (threadError) {
        throw new Error(`Failed to fetch thread: ${threadError.message}`);
      }

      const storedHistoryId = threadRow?.history_id;
      
      // Step 2: Get history ID from Gmail (lightweight metadata fetch for early exit check)
      // Since threads.list doesn't return historyId, we need to fetch it to compare
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-gmail-thread`;
      const brokerSecret = process.env.BROKER_SHARED_SECRET;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!brokerSecret) {
        throw new Error("BROKER_SHARED_SECRET environment variable is not set");
      }

      if (!supabaseAnonKey) {
        throw new Error("SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set");
      }

      // First, try to use incomingHistoryId if provided, otherwise fetch metadata to get it
      let hydratedHistoryId: string | null = null;
      
      if (incomingHistoryId && incomingHistoryId.trim() !== "") {
        // Use provided history ID (if threads.list ever returns it)
        hydratedHistoryId = incomingHistoryId;
      } else {
        // Fetch lightweight metadata to get history ID for comparison
        const metadataResponse = await fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "x-broker-secret": brokerSecret,
          },
          body: JSON.stringify({ userId, threadId, format: "metadata" }),
        });

        if (!metadataResponse.ok) {
          const errorText = await metadataResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: "unknown" };
          }

          // Handle errors
          if (
            (metadataResponse.status === 401 && errorData.error === "gmail_unauthorized") ||
            (metadataResponse.status === 412 && (errorData.error === "missing_google_token" || errorData.error === "token_expired"))
          ) {
            await supabaseAdmin
              .from("sync_jobs")
              .update({
                status: "failed",
                details: "TOKEN_EXPIRED_RECONNECT: Google token expired. Please reconnect your Google account.",
                error: "TOKEN_EXPIRED_RECONNECT",
              })
              .eq("user_id", userId);
            throw new Error("TOKEN_EXPIRED_RECONNECT");
          }

          if (metadataResponse.status === 403 && errorData.error === "gmail_forbidden") {
            await supabaseAdmin
              .from("sync_jobs")
              .update({
                status: "failed",
                details: "TOKEN_SCOPE_MISSING: Gmail permissions are missing. Please grant required scopes.",
                error: "TOKEN_SCOPE_MISSING",
              })
              .eq("user_id", userId);
            throw new Error("TOKEN_SCOPE_MISSING");
          }

          if (metadataResponse.status === 404) {
            console.log(`⚠️  Thread ${threadId} not found in Gmail, skipping`);
            return {
              ok: true,
              userId,
              threadId,
              gmailMessageCount: 0,
              newMessagesStored: 0,
              skippedMessages: 0,
              reasonCounts: {},
              analysisTriggered: false,
            };
          }

          throw new Error(`Failed to fetch Gmail thread metadata: ${metadataResponse.status} - ${errorData.error || "unknown"}`);
        }

        const metadataData: { thread: GmailThread } = await metadataResponse.json();
        const metadataThread = metadataData.thread;
        hydratedHistoryId = metadataThread.historyId || metadataThread.history_id || null;
      }

      // Early exit if history ID matches (no changes, verified via lightweight metadata fetch)
      if (storedHistoryId && hydratedHistoryId && storedHistoryId.toString() === hydratedHistoryId.toString()) {
        console.log(`⏭️  Early exit: historyId unchanged (${hydratedHistoryId}) - verified via lightweight metadata fetch`);
        return {
          ok: true,
          userId,
          threadId,
          gmailMessageCount: 0,
          newMessagesStored: 0,
          skippedMessages: 0,
          reasonCounts: {},
          analysisTriggered: false,
        };
      }

      // Step 3: Fetch full thread from Gmail (history ID changed, needs processing)
      const fetchResponse = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "x-broker-secret": brokerSecret,
        },
        body: JSON.stringify({ userId, threadId, format: "full" }),
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: "unknown" };
        }

        // Handle 401/412 - token expired
        if (
          (fetchResponse.status === 401 && errorData.error === "gmail_unauthorized") ||
          (fetchResponse.status === 412 && (errorData.error === "missing_google_token" || errorData.error === "token_expired"))
        ) {
          await supabaseAdmin
            .from("sync_jobs")
            .update({
              status: "failed",
              details: "TOKEN_EXPIRED_RECONNECT: Google token expired. Please reconnect your Google account.",
              error: "TOKEN_EXPIRED_RECONNECT",
            })
            .eq("user_id", userId);
          throw new Error("TOKEN_EXPIRED_RECONNECT");
        }

        // Handle 403 - scope missing
        if (fetchResponse.status === 403 && errorData.error === "gmail_forbidden") {
          await supabaseAdmin
            .from("sync_jobs")
            .update({
              status: "failed",
              details: "TOKEN_SCOPE_MISSING: Gmail permissions are missing. Please grant required scopes.",
              error: "TOKEN_SCOPE_MISSING",
            })
            .eq("user_id", userId);
          throw new Error("TOKEN_SCOPE_MISSING");
        }

        // Handle 404 - thread not found (skip gracefully)
        if (fetchResponse.status === 404) {
          console.log(`⚠️  Thread ${threadId} not found in Gmail, skipping`);
          return {
            ok: true,
            userId,
            threadId,
            gmailMessageCount: 0,
            newMessagesStored: 0,
            skippedMessages: 0,
            reasonCounts: {},
            analysisTriggered: false,
          };
        }

        throw new Error(`Failed to fetch Gmail thread: ${fetchResponse.status} - ${errorData.error || "unknown"}`);
      }

      const responseData: { thread: GmailThread } = await fetchResponse.json();
      const thread = responseData.thread;

      // Extract historyId from full thread response (may be historyId or history_id)
      // Use the one from full thread if we didn't get it from metadata
      if (!hydratedHistoryId) {
        hydratedHistoryId = thread.historyId || thread.history_id || null;
      }
      const gmailMessages = thread.messages || [];

      console.log(`📧 Fetched ${gmailMessages.length} messages from Gmail for thread ${threadId}`);

      // Extract subject from full thread (subject should already be set at creation, but update if needed)
      let threadSubject = "(No Subject)";
      if (gmailMessages.length > 0) {
        const firstMessage = gmailMessages[0];
        const headers = firstMessage.payload?.headers || [];
        const subjectHeader = headers.find(
          (h: GmailHeader) => h.name?.toLowerCase() === 'subject'
        );
        threadSubject = subjectHeader?.value || "(No Subject)";
      }

      // Step 3: Message-Level Incremental Diff
      const { data: existingMessages, error: existingError } = await supabaseAdmin
        .from("thread_messages")
        .select("message_id")
        .eq("user_id", userId)
        .eq("thread_id", threadId);

      if (existingError) {
        throw new Error(`Failed to fetch existing messages: ${existingError.message}`);
      }

      const existingIds = new Set((existingMessages || []).map((m) => m.message_id));
      const newMessages = gmailMessages.filter((msg) => !existingIds.has(msg.id));

      console.log(`🆕 Found ${newMessages.length} new messages (${existingIds.size} already stored)`);

      // Step 4: Message Filtering Rules
      const reasonCounts: { calendar_invite: number; no_reply: number } = {
        calendar_invite: 0,
        no_reply: 0,
      };

      const newHumanMessages: GmailMessage[] = [];

      for (const msg of newMessages) {
        const headers = msg.payload?.headers || [];
        const fromAddress = getHeader(headers, "from");

        // Check calendar invite
        if (isCalendarInvite(msg)) {
          reasonCounts.calendar_invite++;
          console.log(`🚫 Skipping calendar invite message ${msg.id}`);
          continue;
        }

        // Check no-reply sender
        if (isNoReplySender(fromAddress)) {
          reasonCounts.no_reply++;
          console.log(`🚫 Skipping no-reply message ${msg.id} from ${fromAddress}`);
          continue;
        }

        // Human message - keep for processing
        newHumanMessages.push(msg);
      }

      const skippedMessages = reasonCounts.calendar_invite + reasonCounts.no_reply;

      // Step 5: Mark Thread Ignored (if all new messages were filtered)
      if (newHumanMessages.length === 0 && gmailMessages.length > 0 && skippedMessages > 0) {
        // Check if there are any existing human messages for this thread
        const { data: existingHumanMessages, error: checkError } = await supabaseAdmin
          .from("thread_messages")
          .select("message_id")
          .eq("user_id", userId)
          .eq("thread_id", threadId)
          .limit(1);

        const hasExistingHumanMessages = !checkError && existingHumanMessages && existingHumanMessages.length > 0;

        // Only mark as ignored if there are no existing human messages
        if (!hasExistingHumanMessages) {
          const ignoredReason =
            reasonCounts.calendar_invite > 0 && reasonCounts.no_reply > 0
              ? "filtered_only"
              : reasonCounts.calendar_invite > 0
              ? "calendar_only"
              : reasonCounts.no_reply > 0
              ? "no_reply_only"
              : null;

          await supabaseAdmin
            .from("threads")
            .upsert({
              thread_id: threadId,
              user_id: userId,
              subject: threadSubject,
              is_ignored: true,
              ignored_reason: ignoredReason,
              history_id: hydratedHistoryId || incomingHistoryId || null,
              last_hydrated_at: new Date().toISOString(),
            }, {
              onConflict: 'thread_id',
              ignoreDuplicates: false
            });

          console.log(`🏷️  Marked thread ${threadId} as ignored: ${ignoredReason}`);
        }
      }

      // If no new human messages, just update timestamps and exit
      if (newHumanMessages.length === 0) {
        await supabaseAdmin
          .from("threads")
          .upsert({
            thread_id: threadId,
            user_id: userId,
            subject: threadSubject,
            history_id: hydratedHistoryId || incomingHistoryId || null,
            last_hydrated_at: new Date().toISOString(),
          }, {
            onConflict: 'thread_id',
            ignoreDuplicates: false
          });

        return {
          ok: true,
          userId,
          threadId,
          gmailMessageCount: gmailMessages.length,
          newMessagesStored: 0,
          skippedMessages,
          reasonCounts,
          analysisTriggered: false,
        };
      }

      // Step 6: Body Extraction and Database Insert
      const messagesToInsert: Array<{
        message_id: string;
        thread_id: string;
        user_id: string;
        from_address: string | null;
        to_addresses: string[] | null;
        cc_addresses: string[] | null;
        sent_date: string | null;
        snippet: string | null;
        body_text: string | null;
        body_html: string | null;
      }> = [];

      let maxSentDate: string | null = null;

      for (const msg of newHumanMessages) {
        const payload = msg.payload;
        const headers = payload?.headers || [];

        const fromAddress = getHeader(headers, "from") || null;
        const toValue = getHeader(headers, "to") || "";
        const ccValue = getHeader(headers, "cc") || "";

        const toAddresses = extractEmails(toValue);
        const ccAddresses = extractEmails(ccValue);

        const bodies = getPartBodies(payload);
        let bodyText = bodies.text || null;
        let bodyHtml = bodies.html || null;

        // Clean HTML
        if (bodyHtml) {
          bodyHtml = cleanHtml(bodyHtml);
        }

        // If no plain text but HTML exists, derive text from HTML
        if (!bodyText && bodyHtml) {
          try {
            bodyText = htmlToText(bodyHtml, {
              wordwrap: 120,
            });
          } catch (e) {
            console.warn("Failed to convert HTML to text", e);
          }
        }

        let sentDateIso: string | null = null;
        if (msg.internalDate) {
          const ms = Number(msg.internalDate);
          if (!Number.isNaN(ms)) {
            sentDateIso = new Date(ms).toISOString();
            if (!maxSentDate || sentDateIso > maxSentDate) {
              maxSentDate = sentDateIso;
            }
          }
        }

        messagesToInsert.push({
          message_id: msg.id,
          thread_id: threadId,
          user_id: userId,
          from_address: fromAddress,
          to_addresses: toAddresses.length > 0 ? toAddresses : null,
          cc_addresses: ccAddresses.length > 0 ? ccAddresses : null,
          sent_date: sentDateIso,
          snippet: msg.snippet || null,
          body_text: bodyText,
          body_html: bodyHtml,
        });
      }

      // Insert messages
      if (messagesToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("thread_messages")
          .upsert(messagesToInsert, {
            onConflict: "user_id,message_id",
            ignoreDuplicates: false,
          });

        if (insertError) {
          throw new Error(`Failed to upsert thread_messages: ${insertError.message}`);
        }

        console.log(`✅ Upserted ${messagesToInsert.length} new messages to thread_messages`);
      }

      // Step 7: Thread Upsert (History ID from Full Thread Response)
      // Use upsert to handle both create and update cases
      const { error: upsertError } = await supabaseAdmin
        .from("threads")
        .upsert({
          thread_id: threadId,
          user_id: userId,
          subject: threadSubject,
          history_id: hydratedHistoryId || incomingHistoryId || null,
          last_hydrated_at: new Date().toISOString(),
          last_message_date: maxSentDate,
        }, {
          onConflict: 'thread_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        throw new Error(`Failed to upsert threads: ${upsertError.message}`);
      }

      // Step 8: Trigger Analysis (Conditionally)
      let analysisTriggered = false;
      if (messagesToInsert.length > 0) {
        await analyzeThreadTask.trigger({ userId, threadId });
        analysisTriggered = true;
        console.log(`🚀 Triggered analyze-thread for ${threadId}`);
      }

      // Structured log
      console.log(JSON.stringify({
        task: "hydrate-thread",
        userId,
        threadId,
        gmailMessagesCount: gmailMessages.length,
        newMessagesStored: messagesToInsert.length,
        skippedMessages,
        reasonCounts,
        analysisTriggered,
      }));

      return {
        ok: true,
        userId,
        threadId,
        gmailMessageCount: gmailMessages.length,
        newMessagesStored: messagesToInsert.length,
        skippedMessages,
        reasonCounts,
        analysisTriggered,
        lastMessageDate: maxSentDate || undefined,
      };
    } catch (error) {
      console.error(`❌ Error in hydrate-thread for user ${userId}, thread ${threadId}:`, error);
      throw error;
    }
  },
});

