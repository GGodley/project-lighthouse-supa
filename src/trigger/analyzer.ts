import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient, SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { htmlToText } from "html-to-text";
import type { LLMSummary, NextStep } from "../lib/types/threads";
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
  timeline_summary?: string;
  problem_statement?: string | null;
  customer_sentiment?: string;
  next_steps?: NextStep[];
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


// Unused type - kept for potential future use
// type ThreadMessageUpsert = {
//   message_id: string;
//   thread_id: string;
//   user_id: string;
//   customer_id: string | null;
//   from_address: string | null;
//   to_addresses: string[] | null;
//   cc_addresses: string[] | null;
//   sent_date: string | null;
//   snippet: string | null;
//   body_text: string | null;
//   body_html: string | null;
// };

type NextStepInsert = {
  thread_id: string;
  user_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  requested_by_contact_id: string | null;
  assigned_to_user_id: string | null;
  customer_id: string | null;
  meeting_id: string | null;
};

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for analyzer");
  }
  return new GoogleGenerativeAI(apiKey);
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
    return {
      error: "Empty response from AI",
      timeline_summary: "No summary available.",
      problem_statement: null,
      customer_sentiment: "Neutral",
      next_steps: [],
      parsing_error: true,
    };
  }

  try {
    // 1. Try to parse the string into an Object
    const parsed = JSON.parse(rawContent) as unknown;
    // Validate it's an object
    if (typeof parsed === "object" && parsed !== null) {
      const result = parsed as Partial<LLMSummary> & {
        error?: string;
        timeline_summary?: string;
        problem_statement?: string | null;
        customer_sentiment?: string;
        next_steps?: NextStep[];
        parsing_error?: boolean;
      };
      // Ensure customer_sentiment exists, default to "Neutral" if missing
      if (!result.customer_sentiment) {
        result.customer_sentiment = "Neutral";
      }
      return result as SanitizedLLMResponse;
    }
    throw new Error("Parsed result is not an object");
  } catch (e) {
    // 2. If parsing fails (e.g. AI returned plain text or conversational filler),
    // wrap the raw text inside a valid Object structure.
    console.warn("Failed to parse LLM JSON, falling back to text wrapper", e);
    return {
      error: "Failed to parse LLM response",
      timeline_summary: rawContent || "No summary available", // Save the raw text here so we don't lose it
      problem_statement: null,
      customer_sentiment: "Neutral", // Default fallback
      next_steps: [],
      parsing_error: true,
    };
  }
}

// --- Gmail parsing helpers (ported from Supabase edge function) ---

// Unused function - kept for potential future use (used in commented-out collectBodies)
// const decodeBase64Url = (data: string | undefined): string | undefined => {
//   if (!data) return undefined;
//
//   try {
//     let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
//     while (base64.length % 4) {
//       base64 += "=";
//     }
//
//     const buffer = Buffer.from(base64, "base64");
//     return buffer.toString("utf8");
//   } catch (e) {
//     console.error("Base64 decoding failed for data chunk.", e);
//     return undefined;
//   }
// };

// Unused function - kept for potential future use
// const collectBodies = (
//   payload: GmailMessagePayload | undefined
// ): { text?: string; html?: string } => {
//   let text: string | undefined;
//   let html: string | undefined;
//
//   const visitPart = (part: GmailMessagePart | undefined) => {
//     if (!part) return;
//
//     if (part?.body?.data) {
//       const mimeType = part.mimeType || "";
//       const decodedData = decodeBase64Url(part.body.data);
//
//       if (decodedData) {
//         if (mimeType === "text/plain" && !text) {
//           text = decodedData;
//         }
//         if (mimeType === "text/html" && !html) {
//           html = decodedData;
//         }
//       }
//     }
//
//     if (part?.parts && Array.isArray(part.parts)) {
//       for (const child of part.parts) {
//         visitPart(child);
//       }
//     }
//   };
//
//   if (payload) {
//     // First, try to process parts recursively (existing logic)
//     visitPart(payload);
//     
//     // Fallback: If no body was found in parts, check payload.body.data directly
//     // This handles simple Gmail messages where body is stored directly in payload.body.data
//     if (!text && !html && payload.body?.data) {
//       const decodedData = decodeBase64Url(payload.body.data);
//       if (decodedData) {
//         // Default to text/plain for simple messages when mimeType is unknown
//         text = decodedData;
//       }
//     }
//   }
//
//   return { text, html };
// };

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
): Promise<{
  contextString: string;
  participantCount: number;
  companyIds: string[];
  customerIds: string[];
}> => {
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
      companyIds: [],
      customerIds: [],
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
        // Ensure companyId is not null before using it
        if (!companyId) {
          console.warn(
            `Participants: Warning - companyId is null for domain ${domain} after assignment`
          );
          continue;
        }
        // company_name can be null, so we use a fallback - ensure it's always a string
        const companyName = (existingCompany.company_name ?? formatCompanyName(domain)) as string;
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
              // Ensure companyId is not null before using it
              if (!companyId) {
                console.warn(
                  `Participants: Warning - companyId is null for domain ${domain} after retry`
                );
                continue;
              }
              const retryCompanyName = (retryCompany.company_name ?? formatCompanyName(domain)) as string;
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
          // Ensure companyId is not null before using it
          if (!companyId) {
            console.warn(
              `Participants: Warning - companyId is null for domain ${domain} after creation`
            );
            continue;
          }
          const newCompanyName = (newCompany.company_name ?? companyName) as string;
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
          // Also, user_id is required in the database but missing from generated types
          // We extend the type to include both company_id (nullable) and user_id
          const customerData: Omit<CustomerInsert, "company_id"> & {
            company_id: string | null;
            user_id: string;
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

  // Collect all company IDs (excluding null values for generic domains)
  const companyIds = Array.from(domainToCompanyId.values()).filter(
    (id): id is string => id !== null
  );

  // Collect all customer IDs
  const customerIds = Array.from(emailToCustomerId.values());

  // Step 7.5: Link companies to thread via thread_company_link
  const companyLinks = companyIds.map((companyId) => ({
    thread_id: threadId,
    company_id: companyId,
    user_id: userId,
  }));

  if (companyLinks.length > 0) {
    const { error: companyLinkError } = await supabaseAdmin
      .from("thread_company_link")
      .upsert(companyLinks, {
        onConflict: "thread_id, company_id",
        ignoreDuplicates: false,
      });

    if (companyLinkError) {
      console.error(
        `Participants: Error linking companies to thread:`,
        companyLinkError
      );
      // Don't throw - this is not critical
    } else {
      console.log(
        `Participants: Linked ${companyLinks.length} companies to thread ${threadId}`
      );
    }
  }

  return {
    contextString,
    participantCount: emailToCustomerId.size,
    companyIds,
    customerIds,
  };
};

/**
 * Propagate interaction time to linked companies and customers
 * Updates last_interaction_at only if it's null or older than the thread date
 */
const propagateInteractionTime = async (
  supabaseAdmin: SupabaseClient,
  threadDate: string | null,
  companyIds: string[],
  customerIds: string[]
): Promise<void> => {
  // Skip if threadDate is null or invalid
  if (!threadDate) {
    console.log(
      "InteractionTime: Skipping propagation - threadDate is null"
    );
    return;
  }

  // Validate threadDate is a valid ISO string
  const dateObj = new Date(threadDate);
  if (Number.isNaN(dateObj.getTime())) {
    console.warn(
      `InteractionTime: Invalid threadDate format: ${threadDate}, skipping propagation`
    );
    return;
  }

  // Fetch companies and customers that need updating in parallel
  const fetchPromises = [];

  if (companyIds.length > 0) {
    fetchPromises.push(
      supabaseAdmin
        .from("companies")
        .select("company_id")
        .in("company_id", companyIds)
        .or(`last_interaction_at.is.null,last_interaction_at.lt.${threadDate}`)
        .then((result) => ({ type: "companies" as const, ...result }))
    );
  }

  if (customerIds.length > 0) {
    fetchPromises.push(
      supabaseAdmin
        .from("customers")
        .select("customer_id")
        .in("customer_id", customerIds)
        .or(`last_interaction_at.is.null,last_interaction_at.lt.${threadDate}`)
        .then((result) => ({ type: "customers" as const, ...result }))
    );
  }

  // Wait for all fetches to complete
  const fetchResults = await Promise.allSettled(fetchPromises);

  // Process fetch results and prepare update promises
  const updatePromises = [];

  for (const result of fetchResults) {
    if (result.status === "fulfilled" && result.value.type === "companies") {
      const { data: companiesToUpdate, error: fetchError } = result.value;
      if (fetchError) {
        console.error(
          `InteractionTime: Error fetching companies to update:`,
          fetchError
        );
      } else if (companiesToUpdate && companiesToUpdate.length > 0) {
        const companyIdsToUpdate = companiesToUpdate.map((c) => c.company_id);
        const companyUpdatePromise = supabaseAdmin
          .from("companies")
          .update({ last_interaction_at: threadDate })
          .in("company_id", companyIdsToUpdate);

        updatePromises.push(
          companyUpdatePromise.then((updateResult) => {
            if (updateResult.error) {
              console.error(
                `InteractionTime: Error updating companies:`,
                updateResult.error
              );
            } else {
              console.log(
                `InteractionTime: Updated last_interaction_at for ${companyIdsToUpdate.length} companies`
              );
            }
            return updateResult;
          })
        );
      } else {
        console.log(
          `InteractionTime: No companies need updating (all have newer or equal timestamps)`
        );
      }
    } else if (result.status === "fulfilled" && result.value.type === "customers") {
      const { data: customersToUpdate, error: fetchError } = result.value;
      if (fetchError) {
        console.error(
          `InteractionTime: Error fetching customers to update:`,
          fetchError
        );
      } else if (customersToUpdate && customersToUpdate.length > 0) {
        const customerIdsToUpdate = customersToUpdate.map((c) => c.customer_id);
        const customerUpdatePromise = supabaseAdmin
          .from("customers")
          .update({ last_interaction_at: threadDate })
          .in("customer_id", customerIdsToUpdate);

        updatePromises.push(
          customerUpdatePromise.then((updateResult) => {
            if (updateResult.error) {
              console.error(
                `InteractionTime: Error updating customers:`,
                updateResult.error
              );
            } else {
              console.log(
                `InteractionTime: Updated last_interaction_at for ${customerIdsToUpdate.length} customers`
              );
            }
            return updateResult;
          })
        );
      } else {
        console.log(
          `InteractionTime: No customers need updating (all have newer or equal timestamps)`
        );
      }
    } else if (result.status === "rejected") {
      console.error(
        `InteractionTime: Error in fetch operation:`,
        result.reason
      );
    }
  }

  // Wait for all updates to complete (or fail)
  if (updatePromises.length > 0) {
    await Promise.allSettled(updatePromises);
  } else {
    console.log(
      "InteractionTime: No companies or customers to update"
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
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );

    const genAI = getGeminiClient();

    try {
      // Step 0: Check if thread is ignored
      const { data: threadCheck, error: threadCheckError } = await supabaseAdmin
        .from("threads")
        .select("is_ignored")
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .maybeSingle();

      if (threadCheckError) {
        throw new Error(
          `Analyzer: Failed to check thread ${threadId}: ${threadCheckError.message}`
        );
      }

      if (threadCheck?.is_ignored) {
        console.log(`⏭️  Thread ${threadId} is ignored, skipping analysis`);
        return {
          success: true,
          scenario: "skipped",
          threadId,
          userId,
          reason: "thread_ignored",
        };
      }

      // Step 0.5: Get thread participants and upsert companies/customers
      // Read from thread_messages instead of raw_thread_data
      const { data: threadMessages, error: messagesError } = await supabaseAdmin
        .from("thread_messages")
        .select("from_address, to_addresses, cc_addresses")
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .order("sent_date", { ascending: true });

      if (messagesError) {
        throw new Error(
          `Analyzer: Failed to fetch thread_messages for ${threadId}: ${messagesError.message}`
        );
      }

      // Convert thread_messages to GmailMessage format for participant resolution
      const messagesForParticipants: GmailMessage[] = (threadMessages || []).map((msg) => {
        const headers: GmailHeader[] = [];
        if (msg.from_address) {
          headers.push({ name: "From", value: msg.from_address });
        }
        if (msg.to_addresses && Array.isArray(msg.to_addresses)) {
          headers.push({ name: "To", value: msg.to_addresses.join(", ") });
        }
        if (msg.cc_addresses && Array.isArray(msg.cc_addresses)) {
          headers.push({ name: "Cc", value: msg.cc_addresses.join(", ") });
        }
        return {
          id: "", // Not needed for participant resolution
          threadId,
          payload: { headers },
        };
      });

      let participantContext = "Participants: None";
      if (messagesForParticipants.length > 0) {
        try {
          const participantsResult = await getThreadParticipants(
            supabaseAdmin,
            userId,
            threadId,
            messagesForParticipants
          );
          participantContext = participantsResult.contextString;
          console.log(
            `Analyzer: Participant resolution complete. Context: ${participantContext}`
          );

          // Step 0.6: Propagate interaction time to linked companies and customers
          // Fetch last_message_date from the thread
          const { data: threadWithDate } = await supabaseAdmin
            .from("threads")
            .select("last_message_date")
            .eq("thread_id", threadId)
            .eq("user_id", userId)
            .maybeSingle();

          if (threadWithDate?.last_message_date) {
            try {
              await propagateInteractionTime(
                supabaseAdmin,
                threadWithDate.last_message_date,
                participantsResult.companyIds,
                participantsResult.customerIds
              );
            } catch (interactionTimeError) {
              console.error(
                `Analyzer: Error propagating interaction time:`,
                interactionTimeError
              );
              // Don't fail the entire analysis if interaction time propagation fails
            }
          } else {
            console.log(
              `Analyzer: No last_message_date found for thread ${threadId}, skipping interaction time propagation`
            );
          }
        } catch (participantError) {
          console.error(
            `Analyzer: Error in participant resolution:`,
            participantError
          );
          // Don't fail the entire analysis if participant resolution fails
        }
      }

      // Step 1: Fetch thread with existing summary and last_analyzed_at
      const { data: threadRow, error: threadError } = await supabaseAdmin
        .from("threads")
        .select("thread_id, user_id, llm_summary, last_analyzed_at, summary")
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

      const lastAnalyzedAt: string | null = threadRow.last_analyzed_at;
      const oldSummary = threadRow.summary || null;

      // Step 1.5: Determine analysis mode (matching Python logic)
      const analysisMode: "full" | "incremental" =
        lastAnalyzedAt === null ? "full" : "incremental";

      console.log(`Analyzer: Analysis mode: ${analysisMode}`);

      // Step 2: Fetch and filter messages for incremental mode
      type MessageForAnalysis = {
        message_id: string;
        from_address: string | null;
        body_text: string | null;
        body_html: string | null;
        sent_date: string | null;
        customer_id: string | null;
      };

      let messagesToAnalyze: MessageForAnalysis[] = [];

      if (analysisMode === "incremental") {
        // Fetch all messages ordered by sent_date
        const { data: allMessages, error: messagesError } = await supabaseAdmin
          .from("thread_messages")
          .select(
            "message_id, from_address, body_text, body_html, sent_date, customer_id"
          )
          .eq("thread_id", threadId)
          .eq("user_id", userId)
          .order("sent_date", { ascending: true });

        if (messagesError) {
          throw new Error(
            `Analyzer: Failed to fetch messages for ${threadId}: ${messagesError.message}`
          );
        }

        if (!allMessages || allMessages.length === 0) {
          throw new Error(`Analyzer: No messages found for thread ${threadId}`);
        }

        // Filter messages sent after last_analyzed_at
        const lastAnalyzedDate = new Date(lastAnalyzedAt!);
        const filteredMessages = allMessages.filter((msg) => {
          if (!msg.sent_date) {
            // If no date, include it to be safe
            console.warn(
              `Analyzer: Message ${msg.message_id} has no sent_date, including it`
            );
            return true;
          }
          const msgDate = new Date(msg.sent_date);
          return msgDate > lastAnalyzedDate;
        });

        if (filteredMessages.length === 0) {
          console.log(
            `Analyzer: No new messages since last analysis - skipping analysis`
          );
          // Update thread_processing_stages to completed if it exists
          try {
            const { error: stageUpdateError } = await supabaseAdmin
              .from("thread_processing_stages")
              .update({ current_stage: "completed" })
              .eq("thread_id", threadId)
              .eq("user_id", userId);

            if (stageUpdateError) {
              console.warn(
                `Analyzer: Could not update processing stage: ${stageUpdateError.message}`
              );
            } else {
              console.log(`Analyzer: Updated processing stage to completed`);
            }
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            console.warn(
              `Analyzer: Could not update processing stage: ${errorMessage}`
            );
          }

          return {
            success: true,
            thread_id: threadId,
            analysis: {
              mode: "incremental",
              skipped: true,
              reason: "No new messages",
            },
          };
        }

        messagesToAnalyze = filteredMessages;
        console.log(
          `Analyzer: Filtered to ${messagesToAnalyze.length} new messages for incremental analysis`
        );
      } else {
        // For full mode, fetch all messages for transcript construction
        const { data: allMessages, error: messagesError } = await supabaseAdmin
          .from("thread_messages")
          .select(
            "message_id, from_address, body_text, body_html, sent_date, customer_id"
          )
          .eq("thread_id", threadId)
          .eq("user_id", userId)
          .order("sent_date", { ascending: true });

        if (messagesError) {
          throw new Error(
            `Analyzer: Failed to fetch messages for ${threadId}: ${messagesError.message}`
          );
        }

        if (!allMessages || allMessages.length === 0) {
          console.warn(`Analyzer: No messages found in thread_messages for ${threadId}`);
          // Return gracefully instead of throwing
          return {
            success: false,
            thread_id: threadId,
            error: "no_messages_found",
          };
        }

        messagesToAnalyze = allMessages;
      }

      // Step 3: Construct transcript from messages (matching Python's construct_transcript)
      // First, get participant info for transcript formatting
      const participantsMap: Record<
        string,
        { customer_name: string; company_name: string }
      > = {};

      // Fetch thread participants with customer and company info
      const { data: participantsData } = await supabaseAdmin
        .from("thread_participants")
        .select("customer_id")
        .eq("thread_id", threadId);

      const customerIds = (participantsData || [])
        .map((p) => p.customer_id)
        .filter((id): id is string => id !== null);

      if (customerIds.length > 0) {
        const { data: customersData } = await supabaseAdmin
          .from("customers")
          .select(
            "customer_id, full_name, email, company_id, companies(company_id, company_name)"
          )
          .in("customer_id", customerIds)
          .eq("user_id", userId);

        for (const customer of customersData || []) {
          const customerId = customer.customer_id;
          if (!customerId) continue;

          const companyData = customer.companies;
          let companyName = "Unknown Company";
          if (Array.isArray(companyData) && companyData.length > 0) {
            companyName = companyData[0].company_name || "Unknown Company";
          } else if (
            companyData &&
            typeof companyData === "object" &&
            "company_name" in companyData
          ) {
            companyName =
              (companyData as { company_name: string }).company_name ||
              "Unknown Company";
          }

          const customerName =
            customer.full_name || customer.email?.split("@")[0] || "Unknown";

          participantsMap[customerId] = {
            customer_name: customerName,
            company_name: companyName,
          };
        }
      }

      // Construct transcript from messages
      const transcriptLines: string[] = [];
      for (const msg of messagesToAnalyze) {
        // Prefer body_text, fallback to cleaned body_html
        let bodyText = msg.body_text;
        if (!bodyText && msg.body_html) {
          try {
            bodyText = htmlToText(msg.body_html, {
              wordwrap: 120,
            });
          } catch (e) {
            console.warn("Failed to convert HTML to text for transcript", e);
            bodyText = msg.body_html; // Fallback to HTML if conversion fails
          }
        }
        
        if (!bodyText) continue;

        const customerId = msg.customer_id;
        const participantInfo = customerId ? participantsMap[customerId] : null;
        const customerName = participantInfo?.customer_name || "Unknown";
        const companyName =
          participantInfo?.company_name || "Unknown Company";

        // Format: "CustomerName (CompanyName): message_text"
        transcriptLines.push(`${customerName} (${companyName}): ${bodyText}`);
      }

      const transcript = transcriptLines.join("\n\n");

      // Validate that transcript has content
      if (!transcript || transcript.trim().length === 0) {
        console.warn(`Analyzer: Thread ${threadId} has no content available for analysis`);
        // Return gracefully instead of throwing
        return {
          success: false,
          thread_id: threadId,
          error: "no_content",
        };
      }

      // Step 4: Define comprehensive system prompts (matching Python)
      const fullSystemPrompt = `You are a world-class Customer Success Manager (CSM) analyst. Analyze email threads and extract structured summaries.

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
• Only extract next steps that are EXPLICITLY mentioned in the conversation.
• Do NOT create or infer next steps if they are not clearly stated.
• If no next steps are mentioned, return an empty array [].
• For owner: Extract the name or email of the person responsible. If not mentioned, use null.
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null.
• For priority: Analyze the urgency context. 
  - Set to 'high' if words like 'ASAP', 'urgent', 'immediately', 'critical', 'blocker' are used, or if there is a tight deadline.
  - Set to 'low' if described as 'when you have time', 'no rush', or 'nice to have'.
  - Set to 'medium' for standard business tasks.
• Do not hallucinate or make up next steps.

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

      const incrementalSystemPrompt = `You are a CSM Analyst updating an existing thread.

Context: Here is the summary of the conversation so far: '${oldSummary || "No previous summary"}'.

New Data: Here are the new messages: '${transcript}'.

Goal 1: Return a rewritten summary that merges the old context with the new updates. The summary should be comprehensive and reflect the entire conversation history.

Goal 2: Extract ONLY NEW next steps or feature requests found in the New Data. Do not restate items from the past. If an item was already mentioned in previous messages, do not include it.

Return a JSON object with the following structure:
{
  "problem_statement": "A clear statement of the problem or topic discussed (updated with new context)",
  "key_participants": ["array", "of", "participant", "names"],
  "timeline_summary": "A summary of the timeline of events in the thread (merged old + new)",
  "resolution_status": "Status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Customer sentiment (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {
      "text": "Action item description (ONLY if it's NEW, not mentioned before)",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned",
      "priority": "The urgency level ('high', 'medium', 'low')"
    }
  ],
  "feature_requests": [
    {
      "title": "A brief name that represents the feature conceptually (ONLY if it's NEW)",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority",
      "customer_impact": "Who is affected and how (1 sentence)"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the NEW messages
• Do NOT create or infer next steps if they are not clearly stated
• If no NEW next steps are mentioned, return an empty array []
• Do not restate next steps that were already in the previous summary
• For priority: Analyze the urgency context. 
  - Set to 'high' if words like 'ASAP', 'urgent', 'immediately', 'critical', 'blocker' are used, or if there is a tight deadline.
  - Set to 'low' if described as 'when you have time', 'no rush', or 'nice to have'.
  - Set to 'medium' for standard business tasks.

CRITICAL INSTRUCTIONS FOR FEATURE REQUESTS:
• Only extract feature requests that are NEW in the new messages
• Do not restate feature requests that were already mentioned before
• If no NEW feature requests exist, return an empty array []

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM".`;

      // Select the appropriate system prompt
      const systemPrompt =
        analysisMode === "full" ? fullSystemPrompt : incrementalSystemPrompt;

      // User prompt is simple - just the transcript (matching Python)
      const userPrompt = `Email Thread:\n\n${transcript}\n\n`;

      // Step 5: Call Gemini in JSON mode
      // Combine system and user prompts since Gemini doesn't use role-based messages
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(fullPrompt);
      const content = result.response.text();
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
          const description = (row as { description: string | null }).description;
          if (!description) continue;
          const normalized = description.trim().toLowerCase();
          if (normalized) existingSet.add(normalized);
        }

        // Fetch participants to determine requestor and owner
        const { data: threadParticipants } = await supabaseAdmin
          .from("thread_participants")
          .select("customer_id, user_id")
          .eq("thread_id", threadId);

        let requestedByContactId: string | null = null;
        if (threadParticipants && threadParticipants.length > 0) {
          const customerParticipants = threadParticipants.filter((p) => p.customer_id !== null);
          if (customerParticipants.length > 0) {
            requestedByContactId = customerParticipants[0].customer_id!;
          }
        }

        // Get internal participants for owner matching
        const internalParticipants = threadParticipants
          ?.filter((p) => p.user_id !== null)
          .map((p) => p.user_id!) || [];

        // Fetch profile names for owner matching
        const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
        if (internalParticipants.length > 0) {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", internalParticipants);

          if (profiles) {
            for (const profile of profiles) {
              profileMap.set(profile.id, {
                full_name: profile.full_name,
                email: profile.email,
              });
            }
          }
        }

        const nextStepsToInsert: NextStepInsert[] = [];
        for (const step of nextStepsRaw) {
          const description = typeof step?.text === "string" ? step.text.trim() : "";
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

          // Determine assigned_to_user_id by matching owner string
          let assignedToUserId: string | null = null;
          if (owner) {
            const ownerLower = owner.toLowerCase().trim();
            for (const [userId, profile] of profileMap.entries()) {
              const name = profile.full_name?.toLowerCase() || "";
              const email = profile.email?.toLowerCase() || "";
              if (
                name.includes(ownerLower) ||
                ownerLower.includes(name) ||
                email.includes(ownerLower) ||
                ownerLower.includes(email)
              ) {
                assignedToUserId = userId;
                break;
              }
            }
          }
          // Fallback to thread owner if no match found
          if (!assignedToUserId) {
            assignedToUserId = userId;
          }

          const dueDate = parseDueDate(step?.due_date);

          // Extract and validate priority
          const priorityRaw =
            typeof step?.priority === "string" ? step.priority.trim().toLowerCase() : null;
          const validPriority: "high" | "medium" | "low" =
            priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low"
              ? priorityRaw
              : "medium";

          nextStepsToInsert.push({
            thread_id: threadId,
            user_id: userId,
            description,
            owner,
            due_date: dueDate,
            priority: validPriority,
            status: "todo",
            requested_by_contact_id: requestedByContactId,
            assigned_to_user_id: assignedToUserId,
            customer_id: null,
            meeting_id: null,
          });
        }

        if (nextStepsToInsert.length > 0) {
          const { data: insertedSteps, error: nextStepsInsertError } = await supabaseAdmin
            .from("next_steps")
            .insert(nextStepsToInsert)
            .select("step_id, thread_id");

          if (nextStepsInsertError) {
            throw new Error(
              `Analyzer: Failed to insert next_steps for ${threadId}: ${nextStepsInsertError.message}`
            );
          }

          console.log(
            `Analyzer: Inserted ${nextStepsToInsert.length} next_steps for thread ${threadId}`
          );

          // Create assignments for each inserted next step
          if (insertedSteps && insertedSteps.length > 0) {
            // Get all customers from thread_participants for this thread
            const { data: participants, error: participantsError } = await supabaseAdmin
              .from("thread_participants")
              .select("customer_id")
              .eq("thread_id", threadId)
              .eq("user_id", userId);

            if (participantsError) {
              console.error(
                `Analyzer: Error fetching thread participants for assignments:`,
                participantsError
              );
            } else if (participants && participants.length > 0) {
              // Get distinct customer_ids
              const customerIds = [
                ...new Set(
                  participants
                    .map((p) => p.customer_id)
                    .filter((id): id is string => Boolean(id))
                ),
              ];

              // Create assignments for each next step and customer combination
              const assignments: Array<{
                next_step_id: string;
                customer_id: string;
              }> = [];

              for (const step of insertedSteps) {
                const stepId = (step as { step_id: string }).step_id;
                if (stepId) {
                  for (const customerId of customerIds) {
                    assignments.push({
                      next_step_id: stepId,
                      customer_id: customerId,
                    });
                  }
                }
              }

              if (assignments.length > 0) {
                const { error: assignmentError } = await supabaseAdmin
                  .from("next_step_assignments")
                  .insert(assignments);

                if (assignmentError) {
                  console.error(
                    `Analyzer: Error creating next step assignments:`,
                    assignmentError
                  );
                  // Don't throw - assignments are not critical for the main flow
                } else {
                  console.log(
                    `Analyzer: Created ${assignments.length} next step assignments for thread ${threadId}`
                  );
                }
              }
            }
          }
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
        scenario: analysisMode === "full" ? "fresh" : "update",
        threadId,
        userId,
      };
    } catch (error) {
      console.error("Error executing analyzer pipeline:", error);
      throw error;
    }
  },
});

