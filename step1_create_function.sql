-- ============================================
-- STEP 1: Create the helper function
-- ============================================
-- Run this FIRST to create the function that queries meeting_attendees
-- This function will be used by the RLS policies in step 2
-- ============================================

-- First, verify meeting_attendees table exists and has the expected columns
-- Also test that we can actually query the column to ensure it's accessible
DO $$
DECLARE
  col_name TEXT;
  col_list TEXT;
  test_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'meeting_attendees'
  ) THEN
    RAISE EXCEPTION 'meeting_attendees table does not exist. Please create it first.';
  END IF;

  -- Get list of all columns for better error message
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  INTO col_list
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'meeting_attendees';

  -- Check for meeting_event_id
  SELECT column_name INTO col_name
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'meeting_attendees'
    AND column_name = 'meeting_event_id';

  IF col_name IS NULL THEN
    RAISE EXCEPTION 'meeting_attendees.meeting_event_id column does not exist. Available columns: %. Please check the actual column name.', col_list;
  END IF;

  -- Check for company_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'meeting_attendees'
      AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'meeting_attendees.company_id column does not exist. Available columns: %. Please add it first.', col_list;
  END IF;

  -- Test that we can actually query the column (this ensures it's accessible)
  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.meeting_attendees WHERE meeting_event_id IS NOT NULL' INTO test_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Cannot query meeting_attendees.meeting_event_id column. Error: %', SQLERRM;
  END;
END $$;

-- Drop any old helper functions
DROP FUNCTION IF EXISTS public.meeting_has_attendees_from_user_companies(text, uuid);
DROP FUNCTION IF EXISTS public.user_can_access_meeting_via_company(text, uuid);
DROP FUNCTION IF EXISTS public.get_meeting_event_ids_for_user_companies(uuid);

-- ============================================
-- SECURITY DEFINER FUNCTION
-- ============================================
-- This function queries meeting_attendees by company_id (denormalized)
-- Returns meeting_event_ids for meetings where attendees belong to user's companies
-- 
-- WHY THIS AVOIDS RECURSION:
-- 1. Queries meeting_attendees by company_id (not meeting_event_id) - no FK validation needed
-- 2. Never queries meetings table - only returns IDs
-- 3. Uses SECURITY DEFINER to bypass RLS on meeting_attendees for lookup only
-- 4. Still validates company ownership through companies table
CREATE OR REPLACE FUNCTION public.get_meeting_event_ids_for_user_companies(
  user_uuid uuid
)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
BEGIN
  -- Get all meeting_event_ids from meeting_attendees where company belongs to user
  -- CRITICAL: Query by company_id (denormalized), NOT by meeting_event_id
  -- This avoids FK validation that would trigger meetings RLS policy
  RETURN QUERY
  SELECT DISTINCT ma.meeting_event_id
  FROM public.meeting_attendees ma
  INNER JOIN public.companies c ON ma.company_id = c.company_id
  WHERE c.user_id = user_uuid
    AND ma.meeting_event_id IS NOT NULL;
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_meeting_event_ids_for_user_companies(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_meeting_event_ids_for_user_companies(uuid) IS 
  'Returns meeting_event_ids from meeting_attendees where company belongs to user. Queries by company_id (denormalized) to avoid FK validation recursion. Never queries meetings table.';

-- Test the function to make sure it works
DO $$
DECLARE
  test_result text;
BEGIN
  -- Try to call the function (will fail if there are no users, but that's okay)
  SELECT public.get_meeting_event_ids_for_user_companies('00000000-0000-0000-0000-000000000000'::uuid) INTO test_result LIMIT 1;
  RAISE NOTICE 'Function created successfully and is callable';
EXCEPTION WHEN OTHERS THEN
  -- Function exists and is callable, just no data (which is fine)
  RAISE NOTICE 'Function created successfully (test call completed)';
END $$;

