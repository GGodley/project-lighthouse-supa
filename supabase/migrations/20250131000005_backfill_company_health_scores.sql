-- Backfill company health scores based on customer thread_messages

-- Calculate and set health_score for all companies
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

-- Set health_score to 0 for companies with no analyzed messages
UPDATE public.companies
SET health_score = 0
WHERE health_score IS NULL;

