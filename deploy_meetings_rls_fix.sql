-- ============================================
-- DEPLOY MEETINGS RLS FIX - LONG TERM SOLUTION
-- ============================================
-- Apply these two migrations via Supabase Dashboard SQL Editor
-- URL: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new
--
-- This solution:
-- 1. Uses meeting_attendees table to support multi-company meetings
-- 2. Queries by company_id (denormalized) to avoid FK recursion
-- 3. Uses SECURITY DEFINER function to safely check attendee companies
-- 4. Multiple separate policies for maintainability
--
-- IMPORTANT: This assumes meeting_attendees table exists with:
--   - meeting_event_id (text) column that references meetings.google_event_id
--   - company_id (uuid) column
-- If you get an error about column not existing, check the actual schema first.
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

-- ============================================
-- MIGRATION 1: Fix Interaction Timeline Function
-- ============================================
-- Fix get_interaction_timeline function to include meetings via meeting_attendees
-- This ensures meetings appear in the interaction timeline even if they don't have
-- a direct company_id link, as long as any attendee belongs to the company
--
-- LONG-TERM SOLUTION: Uses meeting_attendees table to find meetings with attendees
-- from the company. Queries meeting_attendees by company_id (not meeting_event_id)
-- to avoid FK validation recursion.

CREATE OR REPLACE FUNCTION get_interaction_timeline(company_id_param uuid)
RETURNS TABLE (
  id text,
  title text,
  summary text,
  interaction_timestamp timestamptz,
  type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Threads (conversations)
  SELECT 
    t.thread_id::text as id,
    COALESCE(t.subject, 'No Subject') as title,
    COALESCE(t.summary, t.snippet, 'No summary available.') as summary,
    t.last_analyzed_at as interaction_timestamp,
    'conversation'::text as type
  FROM threads t
  JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
  WHERE tcl.company_id = company_id_param
    AND t.last_analyzed_at IS NOT NULL
  
  UNION ALL
  
  -- Meetings
  -- Use DISTINCT to avoid duplicates if a meeting matches multiple conditions
  SELECT DISTINCT
    m.google_event_id as id,  -- Use google_event_id (PRIMARY KEY) to match old behavior
    COALESCE(m.title, 'Meeting') as title,
    -- Handle JSONB summary extraction like old function
    CASE 
      WHEN m.summary IS NOT NULL AND m.summary::text ~ '^\s*\{.*\}\s*$' THEN 
        COALESCE((m.summary::jsonb)->>'timeline_summary', (m.summary::jsonb)->>'problem_statement', m.summary::text, 'No summary available.')
      ELSE 
        COALESCE(m.summary::text, 'No summary available.')
    END as summary,
    m.start_time as interaction_timestamp,
    'meeting'::text as type
  FROM meetings m
  WHERE m.start_time IS NOT NULL
    AND m.summary IS NOT NULL  -- Only include meetings with summaries (matching old behavior)
    AND (
      -- Method 1: Direct company_id link on meeting
      m.company_id = company_id_param
      OR
      -- Method 2: Through customer_id -> customers -> company_id
      (m.customer_id IS NOT NULL AND EXISTS (
        SELECT 1 
        FROM customers c 
        WHERE c.customer_id = m.customer_id 
          AND c.company_id = company_id_param
      ))
      OR
      -- Method 3: Through meeting_attendees table (any attendee belongs to company)
      -- CRITICAL: Query meeting_attendees by company_id (not meeting_event_id) to avoid FK recursion
      -- We get meeting_event_ids first, then check if current meeting's google_event_id matches
      m.google_event_id IN (
        SELECT public.meeting_attendees.meeting_event_id::text
        FROM public.meeting_attendees
        WHERE public.meeting_attendees.company_id = company_id_param
          AND public.meeting_attendees.meeting_event_id IS NOT NULL
      )
    )
  
  ORDER BY interaction_timestamp DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_interaction_timeline(uuid) TO authenticated;

-- ============================================
-- MIGRATION 2: Update Meetings RLS Policy
-- ============================================
-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- LONG-TERM ROBUST SOLUTION:
-- Uses multiple separate policies (PostgreSQL ORs them automatically) to avoid recursion
-- Leverages denormalized company_id in meeting_attendees to avoid FK validation issues
--
-- KEY INSIGHT: Query meeting_attendees by company_id (not meeting_event_id) to avoid FK recursion
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings linked to their companies" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings with attendees from their companies" ON public.meetings;

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

-- ============================================
-- MULTIPLE SEPARATE POLICIES (PostgreSQL ORs them)
-- ============================================
-- Using separate policies is more robust because:
-- 1. Each policy is simple and isolated
-- 2. No complex OR conditions that could cause recursion
-- 3. Easier to debug and maintain
-- 4. PostgreSQL automatically ORs multiple policies for the same operation

-- Policy 1: Direct ownership (simple, no recursion risk)
CREATE POLICY "Users can view their own meetings"
ON public.meetings
FOR SELECT
USING (auth.uid() = user_id);

-- Policy 2: Meetings linked via company_id (simple, no recursion risk)
-- Queries companies table only, never touches meetings table
CREATE POLICY "Users can view meetings linked to their companies"
ON public.meetings
FOR SELECT
USING (
  company_id IS NOT NULL 
  AND company_id IN (
    SELECT company_id 
    FROM public.companies 
    WHERE user_id = auth.uid()
  )
);

-- Policy 3: Meetings with attendees from user's companies
-- Uses helper function that queries meeting_attendees by company_id (denormalized)
-- Function never queries meetings table, so no FK validation recursion
-- The function returns a set of meeting_event_ids (SETOF text), policy checks membership
CREATE POLICY "Users can view meetings with attendees from their companies"
ON public.meetings
FOR SELECT
USING (
  google_event_id IN (
    SELECT * FROM public.get_meeting_event_ids_for_user_companies(auth.uid())
  )
);

-- Comments
COMMENT ON POLICY "Users can view their own meetings" ON public.meetings IS 
  'Allows users to view meetings they own directly (user_id = auth.uid())';

COMMENT ON POLICY "Users can view meetings linked to their companies" ON public.meetings IS 
  'Allows users to view meetings linked to their companies via company_id column. Queries companies table only, avoiding recursion.';

COMMENT ON POLICY "Users can view meetings with attendees from their companies" ON public.meetings IS 
  'Allows users to view meetings where attendees belong to their companies (via meeting_attendees table). Uses helper function to avoid FK validation recursion.';

COMMENT ON FUNCTION public.get_meeting_event_ids_for_user_companies(uuid) IS 
  'Returns meeting_event_ids from meeting_attendees where company belongs to user. Queries by company_id (denormalized) to avoid FK validation recursion. Never queries meetings table.';

