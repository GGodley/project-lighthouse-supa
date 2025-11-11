-- Convert overall_sentiment to TEXT if it's an enum, or update constraint to allow 'Neutral'
-- This handles both enum types and CHECK constraints

DO $$
BEGIN
  -- Check if overall_sentiment is using an enum type
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'companies' 
      AND column_name = 'overall_sentiment'
      AND udt_name = 'company_sentiment_status'
  ) THEN
    -- Convert enum column to TEXT
    ALTER TABLE public.companies 
    ALTER COLUMN overall_sentiment TYPE TEXT 
    USING overall_sentiment::TEXT;
    
    -- Drop the enum type if it's no longer used (optional, can be done later)
    -- DROP TYPE IF EXISTS company_sentiment_status;
  END IF;
  
  -- Drop existing constraint if it exists
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_overall_sentiment_check;
  
  -- Add new constraint that allows Healthy, At Risk, and Neutral
  ALTER TABLE public.companies 
  ADD CONSTRAINT companies_overall_sentiment_check 
  CHECK (overall_sentiment IS NULL OR overall_sentiment IN ('Healthy', 'At Risk', 'Neutral'));
END $$;

