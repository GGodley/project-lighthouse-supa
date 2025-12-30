import { createClient } from '@/utils/supabase/server';

export interface CompanyDetails {
  company_id: string;
  company_name: string | null;
  domain_name: string;
  health_score: number | null;
  overall_sentiment: string | null;
  status: string | null;
  mrr: number | null;
  renewal_date: string | null;
  last_interaction_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  ai_insights: {
    one_liner?: string;
    summary?: string;
    tags?: string[];
    linkedin_url?: string;
  } | null;
}

export interface ProductFeedback {
  id: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  source: string | null;
  source_id: string | null;
  source_type: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NextStep {
  id: string;
  text: string;
  status: 'todo' | 'in_progress' | 'done';
  owner: string | null;
  due_date: string | null;
  source_type: 'thread' | 'meeting';
  source_id: string | null;
  created_at: string;
}

export interface Interaction {
  interaction_type: 'email' | 'meeting';
  interaction_date: string;
  id: string;
  title: string;
  summary: string;
  sentiment: string;
}

export interface CompanyData {
  company_details: CompanyDetails;
  product_feedback: ProductFeedback[];
  interaction_timeline: Interaction[];
  next_steps: NextStep[];
}

/**
 * Fetch company details using the get-company-page-details Edge Function
 * This function uses Request Memoization - Next.js will deduplicate calls
 * when used in both layout.tsx and page.tsx
 */
export async function getCompanyDetails(companyId: string): Promise<CompanyData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const functionName = `get-company-page-details?company_id=${companyId}`;
    const { data, error } = await supabase.functions.invoke<CompanyData>(functionName, {
      method: 'GET',
    });

    if (error) {
      console.error('Error fetching company data:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching company data:', err);
    return null;
  }
}

