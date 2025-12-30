// Customer and Company utilities for Trigger.dev tasks
// Ported from supabase/functions/_shared/company-customer-resolver.ts
// Node.js-compatible version for use in Trigger.dev tasks

import type { SupabaseClient } from "@supabase/supabase-js";

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
  const triggerApiKey = process.env.TRIGGER_API_KEY;
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

export interface CompanyCustomerResult {
  company_id: string | null; // null for public email domains
  customer_id: string;
}

export interface BatchPreFetchResult {
  companies: Map<string, string>; // Map<domain, company_id>
  customers: Map<string, string>; // Map<email, customer_id>
}

/**
 * Public email domain blocklist
 * Customers from these domains should not have companies created
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "live.com",
  "msn.com",
  "ymail.com",
  "rocketmail.com",
  "me.com",
  "mac.com",
  "inbox.com",
  "fastmail.com",
  "tutanota.com",
]);

/**
 * Checks if an email domain is a public email provider
 */
export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Pre-fetches all companies and customers for a batch of emails
 * This prevents race conditions in parallel processing by fetching everything upfront
 *
 * @param supabaseClient - Supabase client with service role key
 * @param emails - Array of email addresses to pre-fetch
 * @param userId - User ID who owns the companies/customers
 * @returns Maps of domain->company_id and email->customer_id
 */
export async function batchPreFetchCompaniesAndCustomers(
  supabaseClient: SupabaseClient,
  emails: string[],
  userId: string
): Promise<BatchPreFetchResult> {
  const companies = new Map<string, string>();
  const customers = new Map<string, string>();

  if (emails.length === 0) {
    return { companies, customers };
  }

  // Extract unique domains (excluding public domains)
  const domains = [
    ...new Set(
      emails
        .map((e) => e.split("@")[1])
        .filter((d): d is string => Boolean(d) && !isPublicEmailDomain(d))
    ),
  ];

  // Pre-fetch all companies for these domains
  if (domains.length > 0) {
    const { data: existingCompanies, error: companiesError } =
      await supabaseClient
        .from("companies")
        .select("company_id, domain_name")
        .eq("user_id", userId)
        .in("domain_name", domains);

    if (!companiesError && existingCompanies) {
      existingCompanies.forEach((comp) => {
        companies.set(comp.domain_name, comp.company_id);
      });
    }
  }

  // Pre-fetch all customers for these emails
  if (emails.length > 0) {
    const { data: existingCustomers, error: customersError } =
      await supabaseClient
        .from("customers")
        .select("customer_id, email, company_id")
        .in("email", emails);

    if (!customersError && existingCustomers) {
      existingCustomers.forEach((cust) => {
        customers.set(cust.email, cust.customer_id);
      });
    }
  }

  return { companies, customers };
}

/**
 * Gets or creates a company with database-level locking to prevent race conditions
 * Returns null if domain is a public email provider
 *
 * @param supabaseClient - Supabase client with service role key
 * @param domain - Domain name
 * @param userId - User ID
 * @param preFetchedCompanies - Pre-fetched companies map (optional, for performance)
 * @returns Company ID or null if public domain
 */
export async function getOrCreateCompany(
  supabaseClient: SupabaseClient,
  domain: string,
  userId: string,
  preFetchedCompanies?: Map<string, string>
): Promise<string | null> {
  // Check if domain is public - don't create company for public domains
  if (isPublicEmailDomain(domain)) {
    return null;
  }

  // Check pre-fetched map first
  if (preFetchedCompanies?.has(domain)) {
    return preFetchedCompanies.get(domain)!;
  }

  // Try to fetch existing company
  const { data: existingCompany, error: fetchError } = await supabaseClient
    .from("companies")
    .select("company_id, ai_insights")
    .eq("domain_name", domain)
    .eq("user_id", userId)
    .maybeSingle();

  if (!fetchError && existingCompany?.company_id) {
    return existingCompany.company_id;
  }

  // Company doesn't exist - create it
  // Note: In Supabase, upsert with onConflict handles race conditions at DB level
  const companyName = domain
    .split(".")[0]
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const { data: company, error: companyError } = await supabaseClient
    .from("companies")
    .upsert(
      {
        domain_name: domain,
        company_name: companyName,
        user_id: userId,
      },
      {
        onConflict: "user_id,domain_name",
        ignoreDuplicates: false,
      }
    )
    .select("company_id, domain_name")
    .maybeSingle();

  if (companyError || !company?.company_id) {
    // If duplicate key error, try to fetch again (race condition handled)
    if (
      companyError?.code === "23505" ||
      companyError?.message?.includes("duplicate key")
    ) {
      const { data: retryCompany } = await supabaseClient
        .from("companies")
        .select("company_id")
        .eq("domain_name", domain)
        .eq("user_id", userId)
        .maybeSingle();

      if (retryCompany?.company_id) {
        return retryCompany.company_id;
      }
    }
    throw new Error(
      `Failed to create/find company for domain ${domain}: ${companyError?.message || "No data returned"}`
    );
  }

  // Trigger AI insights generation for newly created company (fire-and-forget)
  // Only trigger if company was just created (not updated)
  if (company && !existingCompany) {
    triggerCompanyInsightsGeneration(company.company_id, company.domain_name, userId)
      .catch(err => {
        // Non-critical - don't fail company creation if this fails
        console.error('Failed to trigger AI insights generation (non-critical):', err);
      });
  }

  return company.company_id;
}

/**
 * Gets or creates a customer with database-level locking to prevent race conditions
 * companyId can be null for public email domains
 *
 * @param supabaseClient - Supabase client with service role key
 * @param email - Customer email
 * @param companyId - Company ID (can be null for public domains)
 * @param userId - User ID
 * @param preFetchedCustomers - Pre-fetched customers map (optional, for performance)
 * @returns Customer ID
 */
export async function getOrCreateCustomer(
  supabaseClient: SupabaseClient,
  email: string,
  companyId: string | null,
  userId: string,
  preFetchedCustomers?: Map<string, string>
): Promise<string> {
  // Check pre-fetched map first
  if (preFetchedCustomers?.has(email)) {
    return preFetchedCustomers.get(email)!;
  }

  // Try to fetch existing customer
  // If companyId is null, search without company_id filter
  // If companyId is set, search with company_id filter
  let existingCustomerQuery = supabaseClient
    .from("customers")
    .select("customer_id")
    .eq("email", email);

  if (companyId) {
    existingCustomerQuery = existingCustomerQuery.eq("company_id", companyId);
  } else {
    existingCustomerQuery = existingCustomerQuery.is("company_id", null);
  }

  const { data: existingCustomer, error: fetchError } =
    await existingCustomerQuery.maybeSingle();

  if (!fetchError && existingCustomer?.customer_id) {
    // Update company_id if it changed (e.g., from null to a company)
    if (companyId && existingCustomer.customer_id) {
      await supabaseClient
        .from("customers")
        .update({ company_id: companyId })
        .eq("customer_id", existingCustomer.customer_id);
    }
    return existingCustomer.customer_id;
  }

  // Customer doesn't exist - create it
  const customerName = email
    .split("@")[0]
    .split(".")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const customerData: {
    email: string;
    full_name: string;
    company_id: string | null;
    user_id: string;
  } = {
    email,
    full_name: customerName,
    company_id: companyId,
    user_id: userId,
  };

  // Use upsert with appropriate conflict resolution
  // If companyId is null, use email+user_id as unique constraint
  // If companyId is set, use company_id+email as unique constraint
  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .upsert(customerData, {
      onConflict: companyId ? "company_id,email" : "email",
      ignoreDuplicates: false,
    })
    .select("customer_id")
    .maybeSingle();

  if (customerError || !customer?.customer_id) {
    // If duplicate key error, try to fetch again (race condition handled)
    if (
      customerError?.code === "23505" ||
      customerError?.message?.includes("duplicate key")
    ) {
      let retryQuery = supabaseClient
        .from("customers")
        .select("customer_id")
        .eq("email", email);

      if (companyId) {
        retryQuery = retryQuery.eq("company_id", companyId);
      } else {
        retryQuery = retryQuery.is("company_id", null);
      }

      const { data: retryCustomer } = await retryQuery.maybeSingle();

      if (retryCustomer?.customer_id) {
        return retryCustomer.customer_id;
      }
    }
    throw new Error(
      `Failed to create/find customer for email ${email}: ${customerError?.message || "No data returned"}`
    );
  }

  return customer.customer_id;
}

/**
 * Ensures that a company_id exists for the given customer.
 * If customer has no company_id, creates a company from the customer's email domain.
 * If customer doesn't exist, creates both customer and company.
 * For public email domains, creates customer without company (company_id = null).
 *
 * @param supabaseClient - Supabase client with service role key
 * @param email - Customer email address (required)
 * @param userId - User ID who owns the company/customer
 * @param preFetched - Pre-fetched companies/customers (optional, for concurrency safety)
 * @returns Object with company_id (can be null) and customer_id
 * @throws Error if unable to resolve customer
 */
export async function ensureCompanyAndCustomer(
  supabaseClient: SupabaseClient,
  email: string,
  userId: string,
  preFetched?: BatchPreFetchResult
): Promise<CompanyCustomerResult> {
  console.log(
    `🔍 [COMPANY_RESOLVER] Starting resolution for email: ${email}, userId: ${userId}`
  );

  // Validate inputs
  if (!email) {
    throw new Error("email is required");
  }
  if (!userId) {
    throw new Error("userId is required");
  }

  // Extract domain
  const domain = email.split("@")[1];
  if (!domain) {
    throw new Error(`Invalid email format: ${email}`);
  }

  // Check if domain is public
  const isPublicDomain = isPublicEmailDomain(domain);

  // Step 1: Check pre-fetched customer first
  let customerId: string | undefined = preFetched?.customers.get(email);

  if (customerId) {
    // Customer exists in pre-fetch - check if it has company_id
    const { data: existingCustomer } = await supabaseClient
      .from("customers")
      .select("customer_id, company_id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (existingCustomer) {
      const companyId = existingCustomer.company_id;
      console.log(
        `✅ [COMPANY_RESOLVER] Found existing customer ${customerId}, company_id: ${companyId || "null"}`
      );

      // For public domains, ensure company_id is null
      if (isPublicDomain && companyId) {
        await supabaseClient
          .from("customers")
          .update({ company_id: null })
          .eq("customer_id", customerId);
        return { customer_id: customerId, company_id: null };
      }

      return {
        company_id: companyId,
        customer_id: customerId,
      };
    }
  }

  // Step 2: Get or create company (returns null for public domains)
  let companyId: string | null = null;
  if (!isPublicDomain) {
    companyId = await getOrCreateCompany(
      supabaseClient,
      domain,
      userId,
      preFetched?.companies
    );
    console.log(
      `✅ [COMPANY_RESOLVER] Created/found company ${companyId} for domain ${domain}`
    );
  } else {
    console.log(
      `ℹ️  [COMPANY_RESOLVER] Domain ${domain} is public - skipping company creation`
    );
  }

  // Step 3: Get or create customer
  customerId = await getOrCreateCustomer(
    supabaseClient,
    email,
    companyId,
    userId,
    preFetched?.customers
  );

  console.log(
    `✅ [COMPANY_RESOLVER] Created/found customer ${customerId} for email ${email}`
  );

  return {
    company_id: companyId,
    customer_id: customerId,
  };
}

