-- Bulk update all existing companies with recalculated health scores
-- This script iterates through all companies and calls recalculate_company_health_score for each

DO $$
DECLARE 
  r RECORD;
BEGIN
  FOR r IN SELECT company_id FROM companies LOOP
    PERFORM recalculate_company_health_score(r.company_id);
  END LOOP;
END $$;

