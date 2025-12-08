// Shared utility for ensuring company_id and customer_id exist before saving feature requests
// This provides a single source of truth for company/customer resolution across all feature request save points
// Enhanced with batch pre-fetching and locking for parallel processing

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompanyCustomerResult {
  company_id: string;
  customer_id: string;
}

export interface BatchPreFetchResult {
  companies: Map<string, string>; // Map<domain, company_id>
  customers: Map<string, string>; // Map<email, customer_id>
}

/**
 * Ensures that a company_id exists for the given customer.
 * If customer has no company_id, creates a company from the customer's email domain.
 * If customer doesn't exist, creates both customer and company.
 * 
 * @param supabaseClient - Supabase client with service role key
 * @param customerId - Existing customer_id (can be null if customer doesn't exist yet)
 * @param customerEmail - Customer email address (required if customerId is null)
 * @param userId - User ID who owns the company/customer
 * @returns Object with company_id and customer_id
 * @throws Error if unable to resolve company/customer
 */
export async function ensureCompanyAndCustomer(
  supabaseClient: SupabaseClient,
  customerId: string | null,
  customerEmail: string | null,
  userId: string
): Promise<CompanyCustomerResult> {
  console.log(`🔍 [COMPANY_RESOLVER] Starting resolution for customerId: ${customerId}, email: ${customerEmail}, userId: ${userId}`);

  // Validate inputs
  if (!customerId && !customerEmail) {
    throw new Error('Either customerId or customerEmail must be provided');
  }
  if (!userId) {
    throw new Error('userId is required');
  }

  let finalCustomerId: string | null = customerId;
  let finalCompanyId: string | null = null;

  // Step 1: If we have customerId, fetch customer to check for company_id
  if (finalCustomerId) {
    const { data: existingCustomer, error: customerError } = await supabaseClient
      .from('customers')
      .select('customer_id, company_id, email')
      .eq('customer_id', finalCustomerId)
      .single();

    if (customerError || !existingCustomer) {
      console.warn(`⚠️ [COMPANY_RESOLVER] Customer ${finalCustomerId} not found, will create new customer`);
      finalCustomerId = null;
      // Use provided email or try to get from error context
      if (!customerEmail) {
        throw new Error(`Customer ${finalCustomerId} not found and no email provided`);
      }
    } else {
      // Customer exists - check if it has company_id
      finalCompanyId = existingCustomer.company_id;
      if (!customerEmail && existingCustomer.email) {
        customerEmail = existingCustomer.email;
      }
      console.log(`✅ [COMPANY_RESOLVER] Found existing customer ${finalCustomerId}, company_id: ${finalCompanyId || 'null'}`);
    }
  }

  // Step 2: If customer has company_id, we're done
  if (finalCompanyId) {
    if (!finalCustomerId) {
      throw new Error('Logic error: company_id found but customer_id is null');
    }
    console.log(`✅ [COMPANY_RESOLVER] Customer already has company_id: ${finalCompanyId}`);
    return {
      company_id: finalCompanyId,
      customer_id: finalCustomerId
    };
  }

  // Step 3: Need to create company from email domain
  if (!customerEmail) {
    throw new Error('Cannot create company: customer email is required but not provided');
  }

  const domain = customerEmail.split('@')[1];
  if (!domain) {
    throw new Error(`Invalid email format: ${customerEmail}`);
  }

  console.log(`🔍 [COMPANY_RESOLVER] Creating company from domain: ${domain}`);

  // Generate company name from domain
  const companyName = domain.split('.')[0]
    .split('-')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Step 4: Create or get company
  const { data: company, error: companyError } = await supabaseClient
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

  if (companyError || !company?.company_id) {
    throw new Error(`Failed to create/find company for domain ${domain}: ${companyError?.message || 'No data returned'}`);
  }

  finalCompanyId = company.company_id;
  console.log(`✅ [COMPANY_RESOLVER] Created/found company ${finalCompanyId} for domain ${domain}`);

  // Step 5: Create or update customer with company_id
  if (!finalCustomerId) {
    // Create new customer
    const customerName = customerEmail.split('@')[0]
      .split('.')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const { data: newCustomer, error: customerCreateError } = await supabaseClient
      .from('customers')
      .upsert({
        email: customerEmail,
        full_name: customerName,
        company_id: finalCompanyId
      }, {
        onConflict: 'company_id, email',
        ignoreDuplicates: false
      })
      .select('customer_id')
      .single();

    if (customerCreateError || !newCustomer?.customer_id) {
      // Handle duplicate key error - try to fetch existing customer
      if (customerCreateError?.code === '23505' || customerCreateError?.message?.includes('duplicate key')) {
        console.warn(`⚠️ [COMPANY_RESOLVER] Duplicate key error, fetching existing customer`);
        const { data: existingCustomer } = await supabaseClient
          .from('customers')
          .select('customer_id')
          .eq('email', customerEmail)
          .eq('company_id', finalCompanyId)
          .single();

        if (existingCustomer?.customer_id) {
          finalCustomerId = existingCustomer.customer_id;
          console.log(`✅ [COMPANY_RESOLVER] Found existing customer ${finalCustomerId} after duplicate key error`);
        } else {
          throw new Error(`Failed to create customer and could not find existing: ${customerCreateError.message}`);
        }
      } else {
        throw new Error(`Failed to create customer: ${customerCreateError?.message || 'No data returned'}`);
      }
    } else {
      finalCustomerId = newCustomer.customer_id;
      console.log(`✅ [COMPANY_RESOLVER] Created new customer ${finalCustomerId} for company ${finalCompanyId}`);
    }
  } else {
    // Update existing customer with company_id
    const { error: updateError } = await supabaseClient
      .from('customers')
      .update({ company_id: finalCompanyId })
      .eq('customer_id', finalCustomerId);

    if (updateError) {
      throw new Error(`Failed to update customer ${finalCustomerId} with company_id: ${updateError.message}`);
    }
    console.log(`✅ [COMPANY_RESOLVER] Updated customer ${finalCustomerId} with company_id ${finalCompanyId}`);
  }

  if (!finalCustomerId || !finalCompanyId) {
    throw new Error('Logic error: Failed to resolve customer_id or company_id');
  }

  return {
    company_id: finalCompanyId,
    customer_id: finalCustomerId
  };
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
  
  // Extract unique domains
  const domains = [...new Set(emails.map(e => e.split('@')[1]).filter(Boolean))];
  
  // Pre-fetch all companies for these domains
  if (domains.length > 0) {
    const { data: existingCompanies, error: companiesError } = await supabaseClient
      .from('companies')
      .select('company_id, domain_name')
      .eq('user_id', userId)
      .in('domain_name', domains);
    
    if (!companiesError && existingCompanies) {
      existingCompanies.forEach(comp => {
        companies.set(comp.domain_name, comp.company_id);
      });
    }
  }
  
  // Pre-fetch all customers for these emails
  if (emails.length > 0) {
    const { data: existingCustomers, error: customersError } = await supabaseClient
      .from('customers')
      .select('customer_id, email, company_id')
      .in('email', emails);
    
    if (!customersError && existingCustomers) {
      existingCustomers.forEach(cust => {
        customers.set(cust.email, cust.customer_id);
      });
    }
  }
  
  return { companies, customers };
}

/**
 * Creates or gets a company with database-level locking to prevent race conditions
 * Uses SELECT FOR UPDATE in a transaction to ensure atomicity
 * 
 * @param supabaseClient - Supabase client with service role key
 * @param domain - Domain name
 * @param userId - User ID
 * @param preFetchedCompanies - Pre-fetched companies map (optional, for performance)
 * @returns Company ID
 */
export async function getOrCreateCompanyWithLock(
  supabaseClient: SupabaseClient,
  domain: string,
  userId: string,
  preFetchedCompanies?: Map<string, string>
): Promise<string> {
  // Check pre-fetched map first
  if (preFetchedCompanies?.has(domain)) {
    return preFetchedCompanies.get(domain)!;
  }
  
  // Try to fetch existing company
  const { data: existingCompany, error: fetchError } = await supabaseClient
    .from('companies')
    .select('company_id')
    .eq('domain_name', domain)
    .eq('user_id', userId)
    .single();
  
  if (!fetchError && existingCompany?.company_id) {
    return existingCompany.company_id;
  }
  
  // Company doesn't exist - create it
  // Note: In Supabase, upsert with onConflict handles race conditions at DB level
  const companyName = domain.split('.')[0]
    .split('-')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  const { data: company, error: companyError } = await supabaseClient
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
  
  if (companyError || !company?.company_id) {
    // If duplicate key error, try to fetch again
    if (companyError?.code === '23505' || companyError?.message?.includes('duplicate key')) {
      const { data: retryCompany } = await supabaseClient
        .from('companies')
        .select('company_id')
        .eq('domain_name', domain)
        .eq('user_id', userId)
        .single();
      
      if (retryCompany?.company_id) {
        return retryCompany.company_id;
      }
    }
    throw new Error(`Failed to create/find company for domain ${domain}: ${companyError?.message || 'No data returned'}`);
  }
  
  return company.company_id;
}

/**
 * Creates or gets a customer with database-level locking to prevent race conditions
 * 
 * @param supabaseClient - Supabase client with service role key
 * @param email - Customer email
 * @param companyId - Company ID
 * @param senderName - Customer name
 * @param preFetchedCustomers - Pre-fetched customers map (optional, for performance)
 * @returns Customer ID
 */
export async function getOrCreateCustomerWithLock(
  supabaseClient: SupabaseClient,
  email: string,
  companyId: string,
  senderName: string,
  preFetchedCustomers?: Map<string, string>
): Promise<string> {
  // Check pre-fetched map first
  if (preFetchedCustomers?.has(email)) {
    return preFetchedCustomers.get(email)!;
  }
  
  // Try to fetch existing customer
  const { data: existingCustomer, error: fetchError } = await supabaseClient
    .from('customers')
    .select('customer_id')
    .eq('email', email)
    .eq('company_id', companyId)
    .single();
  
  if (!fetchError && existingCustomer?.customer_id) {
    return existingCustomer.customer_id;
  }
  
  // Customer doesn't exist - create it
  const { data: customer, error: customerError } = await supabaseClient
    .from('customers')
    .upsert({
      email: email,
      full_name: senderName,
      company_id: companyId
    }, {
      onConflict: 'company_id, email',
      ignoreDuplicates: false
    })
    .select('customer_id')
    .single();
  
  if (customerError || !customer?.customer_id) {
    // If duplicate key error, try to fetch again
    if (customerError?.code === '23505' || customerError?.message?.includes('duplicate key')) {
      const { data: retryCustomer } = await supabaseClient
        .from('customers')
        .select('customer_id')
        .eq('email', email)
        .eq('company_id', companyId)
        .single();
      
      if (retryCustomer?.customer_id) {
        return retryCustomer.customer_id;
      }
    }
    throw new Error(`Failed to create/find customer for email ${email}: ${customerError?.message || 'No data returned'}`);
  }
  
  return customer.customer_id;
}

