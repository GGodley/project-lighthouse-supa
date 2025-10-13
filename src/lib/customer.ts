import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Fetches a customer profile using the correct RPC method
 * @param customerId - The ID of the customer to fetch
 * @param requestingUserId - The ID of the user making the request
 * @returns Promise with customer profile data or error
 */
export async function fetchCustomerProfile(customerId: string, requestingUserId: string) {
  try {
    const { data, error } = await supabase.rpc('get_customer_profile_details', {
      p_customer_id: customerId,
      p_requesting_user_id: requestingUserId
    })

    if (error) {
      throw new Error(`Failed to fetch customer profile: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error in fetchCustomerProfile:', error)
    throw error
  }
}

/**
 * Fetches a customer profile including all interactions (emails and meetings).
 * Returns empty arrays for emails/meetings when none exist.
 */
export async function fetchCustomerProfileWithInteractions(customerId: string, requestingUserId: string) {
  try {
    const { data, error } = await supabase.rpc('get_customer_profile_details', {
      p_customer_id: customerId,
      p_requesting_user_id: requestingUserId
    })

    if (error) {
      throw new Error(`Failed to fetch customer profile with interactions: ${error.message}`)
    }

    const profile = data || {}
    return {
      ...profile,
      emails: Array.isArray(profile.emails) ? profile.emails : [],
      meetings: Array.isArray(profile.meetings) ? profile.meetings : []
    }
  } catch (error) {
    console.error('Error in fetchCustomerProfileWithInteractions:', error)
    throw error
  }
}

/**
 * Fetches all customers for a user using the API route
 * @returns Promise with customers array or error
 */
export async function fetchCustomers() {
  try {
    const response = await fetch('/api/customers', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error('Failed to fetch customers')
    }
    const data = await response.json()
    return data.customers || []
  } catch (error) {
    console.error('Error in fetchCustomers:', error)
    throw error
  }
}
