-- ============================================
-- STEP 2: Create the RLS policies
-- ============================================
-- Run this AFTER step 1 to create the RLS policies that use the function
-- Make sure step 1 completed successfully before running this
-- ============================================

-- Verify the function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_meeting_event_ids_for_user_companies'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'Function get_meeting_event_ids_for_user_companies does not exist. Please run step1_create_function.sql first.';
  END IF;
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings linked to their companies" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings with attendees from their companies" ON public.meetings;

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

-- Verify policies were created
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'meetings'
    AND policyname IN (
      'Users can view their own meetings',
      'Users can view meetings linked to their companies',
      'Users can view meetings with attendees from their companies'
    );
  
  IF policy_count < 3 THEN
    RAISE EXCEPTION 'Expected 3 policies but only found %', policy_count;
  END IF;
  
  RAISE NOTICE 'Successfully created % policies on meetings table', policy_count;
END $$;

