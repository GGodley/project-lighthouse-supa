// Shared utility for ensuring company_id and customer_id exist before saving feature requests
// This provides a single source of truth for company/customer resolution across all feature request save points

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompanyCustomerResult {
  company_id: string;
  customer_id: string;
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

