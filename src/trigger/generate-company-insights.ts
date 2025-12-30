import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for generate-company-insights");
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
 * Generate Company Insights Task - Analyzes company with AI
 * 
 * Pattern: Follows generate-meeting-summary.ts structure (fetch data, call Gemini, save results)
 * 
 * Flow:
 * 1. Receive companyId, domainName, and userId from company creation
 * 2. Check if insights already exist (idempotency)
 * 3. Fetch company context (name, health score, sentiment, interactions)
 * 4. Call Gemini API with structured prompt
 * 5. Parse JSON response
 * 6. Save insights to companies.ai_insights JSONB column
 * 
 * This task is triggered automatically when a new company is created.
 */
export const generateCompanyInsightsTask = task({
  id: "generate-company-insights",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true,
  },
  run: async (payload: {
    companyId: string;
    domainName: string;
    userId: string;
  }) => {
    const { companyId, domainName, userId } = payload;

    console.log(
      `🤖 Generating AI insights for company: ${companyId} (${domainName})`
    );

    // Initialize Supabase client
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

    const genAI = getGeminiClient();

    try {
      // Step 1: Fetch company details and check if insights already exist
      const { data: company, error: companyError } = await supabaseAdmin
        .from("companies")
        .select("ai_insights, company_name, health_score, overall_sentiment, domain_name")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle<CompanyWithInsights>();

      if (companyError) {
        throw new Error(`Failed to fetch company: ${companyError.message}`);
      }

      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }

      // Step 2: Check if insights already exist (idempotency)
      if (company.ai_insights && typeof company.ai_insights === 'object') {
        const insights = company.ai_insights as CompanyInsights;
        if (insights.one_liner) {
          console.log(`✅ Insights already exist for company ${companyId}, skipping generation`);
          return {
            success: true,
            cached: true,
            insights: {
              one_liner: insights.one_liner || '',
              summary: insights.summary || '',
              tags: Array.isArray(insights.tags) ? insights.tags : [],
              linkedin_url: insights.linkedin_url || `https://linkedin.com/company/${domainName}`,
            },
          };
        }
      }

      // Step 3: Fetch interaction timeline count for context
      const { data: timelineData } = await supabaseAdmin
        .rpc('get_company_page_details', { company_id_param: companyId });

      const interactionCount = timelineData?.interaction_timeline?.length || 0;

      console.log(
        `📝 Context: Name='${company.company_name || domainName}', Health=${company.health_score || 'N/A'}, Sentiment='${company.overall_sentiment || 'N/A'}', Interactions=${interactionCount}`
      );

      // Step 4: Construct AI Prompt
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

      // Step 5: Call Gemini API
      console.log("🤖 Sending prompt to Gemini...");
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const result = await model.generateContent(prompt);
      const responseContent = result.response.text();

      if (!responseContent) {
        throw new Error("Empty response from Gemini");
      }

      // Step 6: Parse JSON response
      let insights: CompanyInsights;
      try {
        insights = JSON.parse(responseContent);
      } catch (parseError) {
        console.error("Failed to parse Gemini response:", parseError);
        throw new Error("Invalid JSON response from Gemini");
      }

      // Step 7: Validate required fields
      if (!insights.one_liner || !insights.summary || !Array.isArray(insights.tags)) {
        throw new Error("Invalid insights structure from Gemini");
      }

      // Ensure linkedin_url has a fallback
      if (!insights.linkedin_url) {
        insights.linkedin_url = `https://linkedin.com/company/${domainName}`;
      }

      // Step 8: Save to database
      const { error: updateError } = await supabaseAdmin
        .from("companies")
        .update({ ai_insights: insights })
        .eq("company_id", companyId)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating ai_insights:", updateError);
        throw new Error(`Failed to save insights: ${updateError.message}`);
      }

      console.log(`✅ Successfully generated and saved AI insights for company ${companyId}`);
      return {
        success: true,
        cached: false,
        insights,
      };
    } catch (error) {
      console.error("Error generating company insights:", error);
      throw error;
    }
  },
});

