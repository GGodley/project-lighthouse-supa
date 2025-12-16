import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient, SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import OpenAI from "openai";
import { htmlToText } from "html-to-text";
import type { LLMSummary } from "../lib/types/threads";
import type { Database } from "../types/database";

// Type aliases for database tables
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];

// Type for thread_participants (not in generated types yet)
type ThreadParticipantInsert = {
  thread_id: string;
  customer_id: string;
  user_id: string;
};

// Type for sanitized LLM response
type SanitizedLLMResponse = LLMSummary | {
  error: string;
  summary?: string;
  customer_sentiment?: string;
  parsing_error?: boolean;
};

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

function sanitizeLLMResponse(rawContent: string | null): SanitizedLLMResponse {
  if (!rawContent) {
    return { error: "Empty response from AI", summary: "No summary available." };
  }

  try {
    // 1. Try to parse the string into an Object
    const parsed = JSON.parse(rawContent) as unknown;
    // Validate it's an object
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as SanitizedLLMResponse;
    }
    throw new Error("Parsed result is not an object");
  } catch (e) {
    // 2. If parsing fails (e.g. AI returned plain text or conversational filler),
    // wrap the raw text inside a valid Object structure.
    console.warn("Failed to parse LLM JSON, falling back to text wrapper", e);
    return {
      error: "Failed to parse LLM response",
      summary: rawContent, // Save the raw text here so we don't lose it
      customer_sentiment: "Neutral", // Default fallback
      parsing_error: true,
    };
  }
}

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

// Generic email provider domains - do not create companies for these
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
]);

/**
 * Extract email address from a string that may contain name and email.
 * Examples: "John Doe <john@example.com>" -> "john@example.com"
 *           "john@example.com" -> "john@example.com"
 */
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

/**
 * Extract all email addresses from a header value (may contain multiple emails separated by commas)
 */
const extractEmailsFromHeader = (headerValue: string | null | undefined): Set<string> => {
  const emails = new Set<string>();
  if (!headerValue) return emails;

  // Split by comma and process each part
  const parts = headerValue.split(",");
  for (const part of parts) {
    const email = extractEmailFromAddress(part);
    if (email) {
      emails.add(email);
    }
  }

  return emails;
};

/**
 * Extract name from email header (e.g., "John Doe <john@example.com>" -> "John Doe")
 */
const extractNameFromAddress = (address: string | null | undefined): string | null => {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  if (trimmed.includes("<") && trimmed.includes(">")) {
    const namePart = trimmed.substring(0, trimmed.indexOf("<")).trim();
    // Remove quotes
    return namePart.replace(/^["']|["']$/g, "").trim() || null;
  }

  return null;
};

/**
 * Format domain name into a readable company name
 * Example: "client-co.com" -> "Client Co"
 */
const formatCompanyName = (domain: string): string => {
  // Remove TLD and split by dots/hyphens
  const parts = domain.split(".")[0].split(/[-_]/);
  return parts
    .map((part) => {
      // Capitalize first letter of each part
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
};

/**
 * Format email local part into a readable name
 * Example: "bob.smith@example.com" -> "Bob Smith"
 */
const formatCustomerName = (email: string): string => {
  const localPart = email.split("@")[0];
  const parts = localPart.split(/[._-]/);
  return parts
    .map((part) => {
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
};

/**
 * Get thread participants, upsert companies/customers, and generate context string
 */
const getThreadParticipants = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
  threadId: string,
  messages: GmailMessage[]
): Promise<{ contextString: string; participantCount: number }> => {
  console.log(
    `Participants: Starting participant resolution for thread ${threadId} (user: ${userId})`
  );

  // Step 1: Get user's email to determine their domain
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Participants: Failed to fetch user profile: ${profileError.message}`
    );
  }

  if (!profile?.email) {
    throw new Error(`Participants: User ${userId} has no email in profile`);
  }

  const userEmail = profile.email.toLowerCase();
  const userDomain = userEmail.split("@")[1]?.toLowerCase();
  if (!userDomain) {
    throw new Error(`Participants: Invalid user email format: ${userEmail}`);
  }

  console.log(`Participants: User domain is ${userDomain}`);

  // Step 2: Harvest all unique emails from thread
  const allEmails = new Set<string>();
  const emailToName = new Map<string, string | null>();

  for (const msg of messages) {
    const headers = msg.payload?.headers || [];

    // Extract from address
    const fromHeader = getHeader(headers, "from");
    if (fromHeader) {
      const fromEmails = extractEmailsFromHeader(fromHeader);
      fromEmails.forEach((email) => {
        allEmails.add(email);
        // Try to extract name from header
        const name = extractNameFromAddress(fromHeader);
        if (name && !emailToName.has(email)) {
          emailToName.set(email, name);
        }
      });
    }

    // Extract to addresses
    const toHeader = getHeader(headers, "to");
    if (toHeader) {
      const toEmails = extractEmailsFromHeader(toHeader);
      toEmails.forEach((email) => {
        allEmails.add(email);
        const name = extractNameFromAddress(toHeader);
        if (name && !emailToName.has(email)) {
          emailToName.set(email, name);
        }
      });
    }

    // Extract cc addresses
    const ccHeader = getHeader(headers, "cc");
    if (ccHeader) {
      const ccEmails = extractEmailsFromHeader(ccHeader);
      ccEmails.forEach((email) => {
        allEmails.add(email);
        const name = extractNameFromAddress(ccHeader);
        if (name && !emailToName.has(email)) {
          emailToName.set(email, name);
        }
      });
    }
  }

  console.log(`Participants: Found ${allEmails.size} unique email addresses`);

  // Step 3: Filter internal emails (matching user domain)
  const externalEmails = new Set<string>();
  for (const email of allEmails) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && domain !== userDomain) {
      externalEmails.add(email);
    }
  }

  console.log(
    `Participants: ${externalEmails.size} external emails after filtering`
  );

  if (externalEmails.size === 0) {
    return {
      contextString: "Participants: None (internal thread only)",
      participantCount: 0,
    };
  }

  // Step 4: Group emails by domain
  const domainToEmails = new Map<string, Set<string>>();
  const emailToDomain = new Map<string, string>();

  for (const email of externalEmails) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) continue;

    emailToDomain.set(email, domain);

    if (!domainToEmails.has(domain)) {
      domainToEmails.set(domain, new Set());
    }
    domainToEmails.get(domain)!.add(email);
  }

  console.log(`Participants: Found ${domainToEmails.size} unique domains`);

  // Step 5: Upsert companies and customers
  const domainToCompanyId = new Map<string, string | null>();
  const emailToCustomerId = new Map<string, string>();
  const companyIdToCompanyName = new Map<string, string>();

  // Process each domain
  for (const [domain, emails] of domainToEmails.entries()) {
    let companyId: string | null = null;
    const isGenericDomain = GENERIC_DOMAINS.has(domain);

    if (!isGenericDomain) {
      // Step 5a: Check if company exists
      const { data: existingCompany, error: companyFetchError } =
        await supabaseAdmin
          .from("companies")
          .select("company_id, company_name")
          .eq("domain_name", domain)
          .eq("user_id", userId)
          .maybeSingle();

      if (companyFetchError && companyFetchError.code !== "PGRST116") {
        // PGRST116 is "not found" which is fine
        console.error(
          `Participants: Error fetching company for domain ${domain}:`,
          companyFetchError
        );
      }

      if (existingCompany?.company_id) {
        companyId = existingCompany.company_id;
        // company_name can be null, so we use a fallback - ensure it's always a string
        const companyName: string = existingCompany.company_name || formatCompanyName(domain);
        companyIdToCompanyName.set(companyId, companyName);
        console.log(
          `Participants: Found existing company ${companyId} for domain ${domain}`
        );
      } else {
        // Step 5b: Create new company
        const companyName = formatCompanyName(domain);
        const { data: newCompany, error: companyCreateError } =
          await supabaseAdmin
            .from("companies")
            .upsert(
              {
                domain_name: domain,
                company_name: companyName,
                user_id: userId,
              },
              {
                onConflict: "user_id, domain_name",
                ignoreDuplicates: false,
              }
            )
            .select("company_id, company_name")
            .single();

        if (companyCreateError) {
          // If duplicate key error, try to fetch again
          if (
            companyCreateError.code === "23505" ||
            companyCreateError.message?.includes("duplicate key")
          ) {
            const { data: retryCompany } = await supabaseAdmin
              .from("companies")
              .select("company_id, company_name")
              .eq("domain_name", domain)
              .eq("user_id", userId)
              .maybeSingle();

            if (retryCompany?.company_id) {
              companyId = retryCompany.company_id;
              const retryCompanyName: string = retryCompany.company_name || formatCompanyName(domain);
              companyIdToCompanyName.set(companyId, retryCompanyName);
              console.log(
                `Participants: Retried and found company ${companyId} for domain ${domain}`
              );
            } else {
              console.error(
                `Participants: Failed to create/find company for domain ${domain}:`,
                companyCreateError
              );
              continue; // Skip this domain
            }
          } else {
            console.error(
              `Participants: Failed to create company for domain ${domain}:`,
              companyCreateError
            );
            continue; // Skip this domain
          }
        } else if (newCompany?.company_id) {
          companyId = newCompany.company_id;
          const newCompanyName: string = newCompany.company_name || companyName;
          companyIdToCompanyName.set(companyId, newCompanyName);
          console.log(
            `Participants: Created company ${companyId} (${newCompanyName}) for domain ${domain}`
          );
        }
      }
    } else {
      console.log(
        `Participants: Domain ${domain} is generic, skipping company creation`
      );
    }

    domainToCompanyId.set(domain, companyId);

    // Step 5c: Upsert customers for this domain
    for (const email of emails) {
      try {
        // Get customer name from header or format from email
        let customerName = emailToName.get(email);
        if (!customerName) {
          customerName = formatCustomerName(email);
        }

        // Check if customer exists
        const customerQuery = supabaseAdmin
          .from("customers")
          .select("customer_id, company_id")
          .eq("email", email)
          .eq("user_id", userId);

        if (companyId) {
          customerQuery.eq("company_id", companyId);
        } else {
          customerQuery.is("company_id", null);
        }

        const { data: existingCustomer } =
          await customerQuery.maybeSingle();

        let customerId: string | null = null;

        if (existingCustomer?.customer_id) {
          customerId = existingCustomer.customer_id;
          // Update company_id if it changed (e.g., from null to a company_id)
          if (existingCustomer.company_id !== companyId) {
            await supabaseAdmin
              .from("customers")
              .update({ company_id: companyId })
              .eq("customer_id", customerId);
            console.log(
              `Participants: Updated customer ${customerId} company_id from ${existingCustomer.company_id} to ${companyId}`
            );
          }
          console.log(
            `Participants: Found existing customer ${customerId} for email ${email}`
          );
        } else {
          // Create new customer
          // Note: company_id can be null for generic domains, but CustomerInsert requires string
          // We use Partial to make it optional, then cast to allow null
          const customerData: Omit<CustomerInsert, "company_id"> & {
            company_id: string | null;
          } = {
            email,
            full_name: customerName,
            company_id: companyId, // Can be null for generic domains
            user_id: userId,
          };

          // When company_id is not null, use upsert with the company_id+email constraint
          // When company_id is null, insert directly (we already checked for existence above)
          let newCustomer: { customer_id: string } | null = null;
          let customerCreateError: PostgrestError | null = null;

          if (companyId) {
            // Use upsert with constraint
            const result = await supabaseAdmin
              .from("customers")
              .upsert(customerData, {
                onConflict: "company_id, email",
                ignoreDuplicates: false,
              })
              .select("customer_id")
              .single();
            newCustomer = result.data;
            customerCreateError = result.error;
          } else {
            // Insert directly (no constraint to use for null company_id)
            const result = await supabaseAdmin
              .from("customers")
              .insert(customerData)
              .select("customer_id")
              .single();
            newCustomer = result.data;
            customerCreateError = result.error;
          }

          if (customerCreateError) {
            // If duplicate key error, try to fetch again
            if (
              customerCreateError.code === "23505" ||
              customerCreateError.message?.includes("duplicate key")
            ) {
              const retryQuery = supabaseAdmin
                .from("customers")
                .select("customer_id")
                .eq("email", email)
                .eq("user_id", userId);

              if (companyId) {
                retryQuery.eq("company_id", companyId);
              } else {
                retryQuery.is("company_id", null);
              }

              const { data: retryCustomer } = await retryQuery.maybeSingle();

              if (retryCustomer?.customer_id) {
                customerId = retryCustomer.customer_id;
                console.log(
                  `Participants: Retried and found customer ${customerId} for email ${email}`
                );
              } else {
                console.error(
                  `Participants: Failed to create/find customer for email ${email}:`,
                  customerCreateError
                );
                continue; // Skip this email
              }
            } else {
              console.error(
                `Participants: Failed to create customer for email ${email}:`,
                customerCreateError
              );
              continue; // Skip this email
            }
          } else if (newCustomer?.customer_id) {
            customerId = newCustomer.customer_id;
            console.log(
              `Participants: Created customer ${customerId} (${customerName}) for email ${email}`
            );
          }
        }

        if (customerId) {
          emailToCustomerId.set(email, customerId);
        }
      } catch (error) {
        console.error(
          `Participants: Error processing customer for email ${email}:`,
          error
        );
        // Continue with other emails
      }
    }
  }

  // Step 6: Link customers to thread via thread_participants
  const participantLinks: ThreadParticipantInsert[] = [];

  for (const customerId of emailToCustomerId.values()) {
    participantLinks.push({
      thread_id: threadId,
      customer_id: customerId,
      user_id: userId,
    });
  }

  if (participantLinks.length > 0) {
    const { error: linkError } = await supabaseAdmin
      .from("thread_participants")
      .upsert(participantLinks, {
        onConflict: "thread_id, customer_id",
        ignoreDuplicates: false,
      });

    if (linkError) {
      console.error(
        `Participants: Error linking participants to thread:`,
        linkError
      );
      // Don't throw - this is not critical
    } else {
      console.log(
        `Participants: Linked ${participantLinks.length} participants to thread ${threadId}`
      );
    }
  }

  // Step 7: Generate context string
  // Group customers by company
  const companyToCustomers = new Map<
    string | null,
    Array<{ name: string; email: string }>
  >();

  for (const [email] of emailToCustomerId.entries()) {
    const domain = emailToDomain.get(email);
    const companyId = domain ? domainToCompanyId.get(domain) ?? null : null;
    const customerName = emailToName.get(email) || formatCustomerName(email);

    if (!companyToCustomers.has(companyId)) {
      companyToCustomers.set(companyId, []);
    }
    companyToCustomers.get(companyId)!.push({ name: customerName, email });
  }

  // Build context string
  const contextParts: string[] = [];

  // Process companies first
  for (const [companyId, customers] of companyToCustomers.entries()) {
    if (companyId === null) continue; // Handle generic domains separately

    const companyName = companyIdToCompanyName.get(companyId) || "Unknown Company";
    const customerNames = customers.map((c) => c.name).join(", ");
    contextParts.push(`${companyName} (${customerNames})`);
  }

  // Handle generic domain customers (no company)
  const genericCustomers = companyToCustomers.get(null);
  if (genericCustomers && genericCustomers.length > 0) {
    const genericNames = genericCustomers.map((c) => c.name).join(", ");
    contextParts.push(`Individual (${genericNames})`);
  }

  const contextString =
    contextParts.length > 0
      ? `Participants: ${contextParts.join(", ")}`
      : "Participants: None";

  console.log(`Participants: Generated context: ${contextString}`);

  return {
    contextString,
    participantCount: emailToCustomerId.size,
  };
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

      // Step 0.5: Get thread participants and upsert companies/customers
      // Fetch raw_thread_data to extract messages for participant resolution
      const { data: threadRowForParticipants, error: participantsFetchError } =
        await supabaseAdmin
          .from("threads")
          .select("raw_thread_data")
          .eq("thread_id", threadId)
          .eq("user_id", userId)
          .maybeSingle();

      let participantContext = "Participants: None";
      if (!participantsFetchError && threadRowForParticipants?.raw_thread_data) {
        const rawThreadData = threadRowForParticipants.raw_thread_data;
        const messages: GmailMessage[] = Array.isArray(rawThreadData.messages)
          ? rawThreadData.messages
          : [];

        if (messages.length > 0) {
          try {
            const participantsResult = await getThreadParticipants(
              supabaseAdmin,
              userId,
              threadId,
              messages
            );
            participantContext = participantsResult.contextString;
            console.log(
              `Analyzer: Participant resolution complete. Context: ${participantContext}`
            );
          } catch (participantError) {
            console.error(
              `Analyzer: Error in participant resolution:`,
              participantError
            );
            // Don't fail the entire analysis if participant resolution fails
          }
        }
      }

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
${participantContext}

Analyze this full thread history. Provide a comprehensive summary and identify all open next steps.

Full Thread Transcript:
${body ?? "(no body available)"}
        `.trim();
      } else {
        userPrompt = `
${participantContext}

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

      const content = completion.choices[0]?.message?.content;
      const cleanSummary = sanitizeLLMResponse(content);

      const nowIso = new Date().toISOString();

      // Step 3: Update threads.llm_summary + last_analyzed_at
      const { error: summaryUpdateError } = await supabaseAdmin
        .from("threads")
        .update({
          llm_summary: cleanSummary,
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
      // Type guard to check if cleanSummary is a valid LLMSummary with next_steps
      const isValidSummary = (
        summary: SanitizedLLMResponse | null
      ): summary is LLMSummary => {
        return (
          summary !== null &&
          typeof summary === "object" &&
          !("error" in summary) &&
          "next_steps" in summary &&
          Array.isArray(summary.next_steps)
        );
      };

      const nextStepsRaw = isValidSummary(cleanSummary)
        ? cleanSummary.next_steps
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

