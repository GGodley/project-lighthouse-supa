'use server';

import { createClient } from '@/utils/supabase/server';

interface CompanyInsights {
  one_liner: string;
  summary: string;
  tags: string[];
  linkedin_url: string;
}

interface CompanyWithInsights {
  ai_insights: CompanyInsights | null;
  company_name: string | null;
  health_score: number | null;
  overall_sentiment: string | null;
  domain_name: string;
}

/**
 * Server Action to trigger AI insights generation for a company via Trigger.dev
 * 
 * This action triggers the Trigger.dev task which handles the AI generation asynchronously.
 * The task will check cache, call Gemini API, and save results to companies.ai_insights.
 * 
 * @param companyId - UUID of the company
 * @param domainName - Domain name of the company
 * @returns Object with success status and optional error message
 */
export async function generateCompanyInsights(
  companyId: string,
  domainName: string
): Promise<{ success: boolean; error?: string; runId?: string }> {
  try {
    // Initialize Supabase client
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Step 1: Check cache - if insights already exist, return them
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('ai_insights, company_name, health_score, overall_sentiment, domain_name')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single<CompanyWithInsights>();

    if (companyError || !company) {
      console.error('Error fetching company:', companyError);
      return { success: false, error: 'Company not found' };
    }

    // If ai_insights exists and has one_liner, return success (already cached)
    if (company.ai_insights && typeof company.ai_insights === 'object') {
      const insights = company.ai_insights as CompanyInsights;
      if (insights.one_liner) {
        console.log('AI insights already exist for company:', companyId);
        return { success: true };
      }
    }

    // Step 2: Trigger Trigger.dev task
    const triggerApiKey = process.env.TRIGGER_API_KEY;
    if (!triggerApiKey) {
      console.error('TRIGGER_API_KEY not configured');
      return { success: false, error: 'TRIGGER_API_KEY not configured' };
    }

    const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/generate-company-insights/trigger';
    const triggerPayload = {
      payload: {
        companyId,
        domainName,
        userId: user.id,
      },
      concurrencyKey: companyId, // Prevent duplicate runs for same company
    };

    console.log('📡 Triggering AI insights generation via Trigger.dev:', {
      companyId,
      domainName,
      userId: user.id,
    });

    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to trigger AI insights generation:', errorText);
      return { 
        success: false, 
        error: `Failed to trigger task: ${response.status} - ${errorText}` 
      };
    }

    const result = await response.json();
    console.log('✅ Successfully triggered AI insights generation:', {
      runId: result.id,
      companyId,
    });

    return { 
      success: true, 
      runId: result.id || undefined 
    };
  } catch (error) {
    console.error('Error triggering company insights generation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

