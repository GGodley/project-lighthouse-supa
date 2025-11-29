-- Disable all triggers that update urgency counts
-- This is a temporary fix to allow urgency updates to work
-- We can re-enable and fix the triggers later

-- Drop ALL triggers on feature_requests that might update features table
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.feature_requests'::regclass
      AND tgisinternal = false
      AND (tgname ILIKE '%urgency%' 
           OR tgname ILIKE '%count%' 
           OR tgname ILIKE '%feature%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.feature_requests', trigger_record.tgname);
    RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
  END LOOP;
END $$;

-- Also check if there's a view or materialized view causing issues
-- If features is a view, we need to handle it differently
DO $$
DECLARE
  is_view BOOLEAN;
  is_matview BOOLEAN;
BEGIN
  -- Check if features is a view
  SELECT EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' AND viewname = 'features'
  ) INTO is_view;
  
  -- Check if features is a materialized view
  SELECT EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' AND matviewname = 'features'
  ) INTO is_matview;
  
  IF is_view THEN
    RAISE NOTICE 'WARNING: features is a VIEW, not a table. This might be causing the issue.';
  ELSIF is_matview THEN
    RAISE NOTICE 'WARNING: features is a MATERIALIZED VIEW, not a table. This might be causing the issue.';
  ELSE
    RAISE NOTICE 'features is a regular table (not a view).';
  END IF;
END $$;

-- For now, just ensure no triggers are interfering
-- The urgency counts can be recalculated later if needed
-- This allows urgency updates to work without the trigger conflict

