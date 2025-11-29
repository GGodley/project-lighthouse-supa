-- Drop ALL existing triggers that might be updating urgency counts
-- This is a more aggressive approach to fix the "multiple assignments" error

-- First, drop any triggers we created
DROP TRIGGER IF EXISTS update_feature_urgency_counts_trigger ON public.feature_requests;
DROP TRIGGER IF EXISTS update_feature_urgency_counts_on_delete_trigger ON public.feature_requests;

-- Drop the functions
DROP FUNCTION IF EXISTS update_feature_urgency_counts();
DROP FUNCTION IF EXISTS update_feature_urgency_counts_on_delete();

-- Now, find and drop ANY other triggers that might be updating features table
-- We'll list them first, then drop them
DO $$
DECLARE
  trigger_record RECORD;
  function_record RECORD;
BEGIN
  -- List all triggers on feature_requests
  RAISE NOTICE '=== TRIGGERS ON feature_requests ===';
  FOR trigger_record IN
    SELECT 
      tgname as trigger_name,
      pg_get_triggerdef(oid) as trigger_definition
    FROM pg_trigger
    WHERE tgrelid = 'public.feature_requests'::regclass
      AND tgisinternal = false
  LOOP
    RAISE NOTICE 'Trigger: %', trigger_record.trigger_name;
    RAISE NOTICE 'Definition: %', trigger_record.trigger_definition;
    
    -- Drop any trigger that mentions urgency or features
    IF trigger_record.trigger_definition ILIKE '%urgency%' 
       OR trigger_record.trigger_definition ILIKE '%features%'
       OR trigger_record.trigger_definition ILIKE '%count%' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.feature_requests', trigger_record.trigger_name);
      RAISE NOTICE 'Dropped trigger: %', trigger_record.trigger_name;
    END IF;
  END LOOP;

  -- List all triggers on features table
  RAISE NOTICE '=== TRIGGERS ON features ===';
  FOR trigger_record IN
    SELECT 
      tgname as trigger_name,
      pg_get_triggerdef(oid) as trigger_definition
    FROM pg_trigger
    WHERE tgrelid = 'public.features'::regclass
      AND tgisinternal = false
  LOOP
    RAISE NOTICE 'Trigger: %', trigger_record.trigger_name;
    RAISE NOTICE 'Definition: %', trigger_record.trigger_definition;
  END LOOP;

  -- Check for functions that might be updating urgency counts
  RAISE NOTICE '=== FUNCTIONS THAT MIGHT UPDATE URGENCY COUNTS ===';
  FOR function_record IN
    SELECT 
      proname as function_name,
      pg_get_functiondef(oid) as function_definition
    FROM pg_proc
    WHERE proname ILIKE '%urgency%' 
       OR proname ILIKE '%count%'
       OR proname ILIKE '%feature%'
  LOOP
    RAISE NOTICE 'Function: %', function_record.function_name;
    -- Show first 200 chars of definition
    RAISE NOTICE 'Definition (first 200 chars): %', substring(function_record.function_definition, 1, 200);
  END LOOP;
END $$;

-- Check for views or materialized views that might have triggers
DO $$
DECLARE
  view_record RECORD;
BEGIN
  RAISE NOTICE '=== VIEWS/MATERIALIZED VIEWS ===';
  FOR view_record IN
    SELECT 
      schemaname,
      viewname,
      definition
    FROM pg_views
    WHERE schemaname = 'public'
      AND (viewname ILIKE '%feature%' OR viewname ILIKE '%urgency%')
  LOOP
    RAISE NOTICE 'View: %', view_record.viewname;
  END LOOP;

  FOR view_record IN
    SELECT 
      schemaname,
      matviewname as viewname
    FROM pg_matviews
    WHERE schemaname = 'public'
      AND (matviewname ILIKE '%feature%' OR matviewname ILIKE '%urgency%')
  LOOP
    RAISE NOTICE 'Materialized View: %', view_record.viewname;
  END LOOP;
END $$;

-- Now create a single, correct trigger function
-- This function will update urgency counts properly
CREATE OR REPLACE FUNCTION update_feature_urgency_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_urgency TEXT;
  new_urgency TEXT;
  feature_id_val UUID;
BEGIN
  -- Get the feature_id and urgency values
  feature_id_val = COALESCE(NEW.feature_id, OLD.feature_id);
  
  -- Handle different trigger operations
  IF TG_OP = 'INSERT' THEN
    -- New feature request - increment the count for the new urgency
    UPDATE public.features
    SET
      low_urgency_count = low_urgency_count + CASE WHEN NEW.urgency::TEXT = 'Low' THEN 1 ELSE 0 END,
      medium_urgency_count = medium_urgency_count + CASE WHEN NEW.urgency::TEXT = 'Medium' THEN 1 ELSE 0 END,
      high_urgency_count = high_urgency_count + CASE WHEN NEW.urgency::TEXT = 'High' THEN 1 ELSE 0 END,
      request_count = request_count + 1
    WHERE id = feature_id_val;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Urgency changed - decrement old, increment new
    old_urgency = COALESCE(OLD.urgency::TEXT, '');
    new_urgency = COALESCE(NEW.urgency::TEXT, '');
    
    -- Only update if urgency actually changed
    IF old_urgency = new_urgency THEN
      RETURN NEW;
    END IF;
    
    -- Single UPDATE statement to avoid multiple assignments error
    UPDATE public.features
    SET
      low_urgency_count = low_urgency_count 
        + CASE WHEN new_urgency = 'Low' THEN 1 ELSE 0 END
        - CASE WHEN old_urgency = 'Low' THEN 1 ELSE 0 END,
      medium_urgency_count = medium_urgency_count 
        + CASE WHEN new_urgency = 'Medium' THEN 1 ELSE 0 END
        - CASE WHEN old_urgency = 'Medium' THEN 1 ELSE 0 END,
      high_urgency_count = high_urgency_count 
        + CASE WHEN new_urgency = 'High' THEN 1 ELSE 0 END
        - CASE WHEN old_urgency = 'High' THEN 1 ELSE 0 END
    WHERE id = feature_id_val;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Feature request deleted - decrement the count
    UPDATE public.features
    SET
      low_urgency_count = low_urgency_count - CASE WHEN OLD.urgency::TEXT = 'Low' THEN 1 ELSE 0 END,
      medium_urgency_count = medium_urgency_count - CASE WHEN OLD.urgency::TEXT = 'Medium' THEN 1 ELSE 0 END,
      high_urgency_count = high_urgency_count - CASE WHEN OLD.urgency::TEXT = 'High' THEN 1 ELSE 0 END,
      request_count = request_count - 1
    WHERE id = OLD.feature_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create a single trigger that handles all operations
CREATE TRIGGER update_feature_urgency_counts_trigger
  AFTER INSERT OR UPDATE OF urgency OR DELETE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_urgency_counts();

-- Add comment
COMMENT ON FUNCTION update_feature_urgency_counts() IS 'Updates urgency count columns in features table when feature_requests are inserted, updated, or deleted. Uses single UPDATE to avoid multiple assignments error.';

