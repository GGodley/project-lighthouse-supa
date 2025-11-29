-- Check for and fix triggers that update urgency counts in features table
-- The error "multiple assignments to same column" suggests a trigger is updating counts incorrectly

-- First, check if there are any triggers on feature_requests that update features table
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT 
      tgname as trigger_name,
      pg_get_triggerdef(oid) as trigger_definition
    FROM pg_trigger
    WHERE tgrelid = 'public.feature_requests'::regclass
      AND tgisinternal = false
  LOOP
    RAISE NOTICE 'Trigger found: % - Definition: %', trigger_record.trigger_name, trigger_record.trigger_definition;
  END LOOP;
END $$;

-- Check for triggers on features table that might be causing issues
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT 
      tgname as trigger_name,
      pg_get_triggerdef(oid) as trigger_definition
    FROM pg_trigger
    WHERE tgrelid = 'public.features'::regclass
      AND tgisinternal = false
  LOOP
    RAISE NOTICE 'Trigger on features: % - Definition: %', trigger_record.trigger_name, trigger_record.trigger_definition;
  END LOOP;
END $$;

-- If there's a trigger updating urgency counts, we need to ensure it only updates once
-- For now, let's create a function that properly updates urgency counts
-- This function will be called by a trigger to update counts when urgency changes

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
  old_urgency = COALESCE(OLD.urgency::TEXT, '');
  new_urgency = COALESCE(NEW.urgency::TEXT, '');

  -- Only update if urgency actually changed
  IF old_urgency = new_urgency THEN
    RETURN NEW;
  END IF;

  -- Update counts: decrement old urgency, increment new urgency
  -- Use a single UPDATE statement to avoid multiple assignments
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
END;
$$;

-- Drop existing trigger if it exists (to avoid conflicts)
DROP TRIGGER IF EXISTS update_feature_urgency_counts_trigger ON public.feature_requests;

-- Create the trigger
CREATE TRIGGER update_feature_urgency_counts_trigger
  AFTER INSERT OR UPDATE OF urgency OR DELETE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_urgency_counts();

-- Also handle DELETE case (decrement counts when feature request is deleted)
CREATE OR REPLACE FUNCTION update_feature_urgency_counts_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Decrement the count for the deleted urgency level
  UPDATE public.features
  SET
    low_urgency_count = low_urgency_count - CASE WHEN OLD.urgency = 'Low' THEN 1 ELSE 0 END,
    medium_urgency_count = medium_urgency_count - CASE WHEN OLD.urgency = 'Medium' THEN 1 ELSE 0 END,
    high_urgency_count = high_urgency_count - CASE WHEN OLD.urgency = 'High' THEN 1 ELSE 0 END
  WHERE id = OLD.feature_id;

  RETURN OLD;
END;
$$;

-- Drop and recreate delete trigger
DROP TRIGGER IF EXISTS update_feature_urgency_counts_on_delete_trigger ON public.feature_requests;

CREATE TRIGGER update_feature_urgency_counts_on_delete_trigger
  AFTER DELETE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_urgency_counts_on_delete();

