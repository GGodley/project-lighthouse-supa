-- Backfill overall_sentiment for all companies based on 90-day sentiment sum
-- NOTE: This migration should run AFTER 20250131000009_add_neutral_to_company_sentiment_enum.sql

-- Recalculate overall_sentiment for all companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN 
    SELECT DISTINCT company_id 
    FROM public.companies
  LOOP
    PERFORM public.calculate_company_health_score(company_record.company_id);
  END LOOP;
END $$;

