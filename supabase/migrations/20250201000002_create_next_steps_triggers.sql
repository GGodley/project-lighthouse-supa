-- Create function to invoke process-next-steps edge function
CREATE OR REPLACE FUNCTION invoke_process_next_steps(
  p_source_type TEXT,
  p_source_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
  v_response TEXT;
BEGIN
  -- Get Supabase URL and service key from environment
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- If not set in app settings, try to get from function settings
  IF v_url IS NULL THEN
    v_url := current_setting('app.supabase_url', true);
  END IF;
  
  IF v_service_key IS NULL THEN
    v_service_key := current_setting('app.service_role_key', true);
  END IF;
  
  -- If still not available, we'll use HTTP extension to call the function
  -- Note: This requires the http extension to be enabled
  -- For now, we'll use a simpler approach with pg_net or direct HTTP call
  
  -- Use pg_net to make HTTP request (if available)
  -- Otherwise, we'll handle this via application-level triggers
  -- For Supabase, we'll use a database webhook or handle in application code
  
  -- For now, just log - actual invocation will be handled by application code
  RAISE NOTICE 'Next steps processing requested for %: %', p_source_type, p_source_id;
END;
$$;

-- Create trigger function for threads
CREATE OR REPLACE FUNCTION trigger_process_thread_next_steps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process if llm_summary was updated and contains next steps
  IF NEW.llm_summary IS NOT NULL AND NEW.llm_summary IS DISTINCT FROM OLD.llm_summary THEN
    -- Check if next_steps exist in the summary
    IF (
      (NEW.llm_summary ? 'next_steps' AND jsonb_array_length(NEW.llm_summary->'next_steps') > 0) OR
      (NEW.llm_summary ? 'csm_next_step' AND (NEW.llm_summary->>'csm_next_step') IS NOT NULL AND (NEW.llm_summary->>'csm_next_step') != '')
    ) THEN
      -- Invoke the edge function via HTTP (using pg_net if available)
      -- For Supabase, we'll use a different approach - queue a job or call directly
      PERFORM invoke_process_next_steps('thread', NEW.thread_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for threads
DROP TRIGGER IF EXISTS process_thread_next_steps_trigger ON public.threads;
CREATE TRIGGER process_thread_next_steps_trigger
  AFTER UPDATE OF llm_summary ON public.threads
  FOR EACH ROW
  WHEN (NEW.llm_summary IS NOT NULL)
  EXECUTE FUNCTION trigger_process_thread_next_steps();

-- Create trigger function for meetings
CREATE OR REPLACE FUNCTION trigger_process_meeting_next_steps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process if next_steps was updated
  IF NEW.next_steps IS NOT NULL AND NEW.next_steps IS DISTINCT FROM OLD.next_steps THEN
    -- Invoke the edge function
    PERFORM invoke_process_next_steps('meeting', NEW.google_event_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for meetings
DROP TRIGGER IF EXISTS process_meeting_next_steps_trigger ON public.meetings;
CREATE TRIGGER process_meeting_next_steps_trigger
  AFTER UPDATE OF next_steps ON public.meetings
  FOR EACH ROW
  WHEN (NEW.next_steps IS NOT NULL)
  EXECUTE FUNCTION trigger_process_meeting_next_steps();

-- Note: The actual HTTP call to the edge function will be handled by application code
-- or via Supabase's pg_net extension if available. The triggers above mark when
-- processing should occur. For production, consider using a queue system or
-- calling the edge function directly from application code after database updates.

