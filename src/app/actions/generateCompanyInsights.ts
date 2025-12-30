'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for generateCompanyInsights');
  }
  return new GoogleGenerativeAI(apiKey);
};

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
 * Server Action to generate AI insights for a company
 * 
 * Checks cache first, then calls Gemini API if needed.
 * Saves results to companies.ai_insights JSONB column.
 * 
 * @param companyId - UUID of the company
 * @param domainName - Domain name of the company
 * @returns CompanyInsights object or null if error
 */
export async function generateCompanyInsights(
  companyId: string,
  domainName: string
): Promise<CompanyInsights | null> {
  try {
    // Initialize Supabase client
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Unauthorized');
    }

    // Step 1: Check cache - query companies.ai_insights
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('ai_insights, company_name, health_score, overall_sentiment, domain_name')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single<CompanyWithInsights>();

    if (companyError || !company) {
      console.error('Error fetching company:', companyError);
      return null;
    }

    // If ai_insights exists and has one_liner, return cached data
    if (company.ai_insights && typeof company.ai_insights === 'object') {
      const insights = company.ai_insights as CompanyInsights;
      if (insights.one_liner) {
        console.log('Returning cached AI insights for company:', companyId);
        return {
          one_liner: insights.one_liner || '',
          summary: insights.summary || '',
          tags: Array.isArray(insights.tags) ? insights.tags : [],
          linkedin_url: insights.linkedin_url || `https://linkedin.com/company/${domainName}`,
        };
      }
    }

    // Step 2: Fetch company context for prompt
    // Get interaction timeline count
    const { data: timelineData } = await supabase
      .rpc('get_company_page_details', { company_id_param: companyId });

    const interactionCount = timelineData?.interaction_timeline?.length || 0;

    // Step 3: Call Gemini API
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const prompt = `Analyze the company with domain ${domainName}.
Company Name: ${company.company_name || domainName}
Health Score: ${company.health_score || 'Not set'}
Sentiment: ${company.overall_sentiment || 'Not set'}
Recent Interactions: ${interactionCount}

Return ONLY a raw JSON object (no markdown) with this structure: 
{ 
  "one_liner": "A concise 10-word description of their core business.", 
  "summary": "A 3-sentence executive summary of their market position and products.", 
  "tags": ["Industry", "Sector", "Specialty"],
  "linkedin_url": "https://linkedin.com/company/${domainName} or actual URL if found"
}

Focus on: industry, role, key relationship context, and business characteristics.`;

    console.log('🤖 Calling Gemini API for company insights:', companyId);
    const result = await model.generateContent(prompt);
    const responseContent = result.response.text();

    if (!responseContent) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    let insights: CompanyInsights;
    try {
      insights = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      throw new Error('Invalid JSON response from Gemini');
    }

    // Validate required fields
    if (!insights.one_liner || !insights.summary || !Array.isArray(insights.tags)) {
      throw new Error('Invalid insights structure from Gemini');
    }

    // Ensure linkedin_url has a fallback
    if (!insights.linkedin_url) {
      insights.linkedin_url = `https://linkedin.com/company/${domainName}`;
    }

    // Step 4: Save to database using service role client (to bypass RLS for updates)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabaseAdmin = createSupabaseAdminClient(
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

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ ai_insights: insights })
      .eq('company_id', companyId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating ai_insights:', updateError);
      // Still return the insights even if update fails
    } else {
      console.log('✅ Successfully saved AI insights to database');
    }

    return insights;
  } catch (error) {
    console.error('Error generating company insights:', error);
    return null;
  }
}

