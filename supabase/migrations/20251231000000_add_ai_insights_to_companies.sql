-- Add ai_insights JSONB column to companies table
-- Stores structured AI-generated data: one_liner, summary, tags, linkedin_url
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ai_insights JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.companies.ai_insights IS 'Structured AI-generated insights: one_liner, summary, tags (array), linkedin_url';

