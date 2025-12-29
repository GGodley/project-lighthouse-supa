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
AS $$
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
$$;

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
-- The function returns a set of meeting_event_ids, policy checks membership
CREATE POLICY "Users can view meetings with attendees from their companies"
ON public.meetings
FOR SELECT
USING (
  google_event_id IN (
    SELECT meeting_event_id 
    FROM public.get_meeting_event_ids_for_user_companies(auth.uid())
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
