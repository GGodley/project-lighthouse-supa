-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql
-- Replaces the restrictive "Users can view their own meetings" policy with an expanded version
--
-- NOTE: All checks are done inline in the policy to avoid function call recursion
-- The policy only references the current row's columns and queries other tables (companies, meeting_attendees)
-- which don't have circular dependencies with meetings table

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;

-- Drop the helper function if it exists (no longer needed)
DROP FUNCTION IF EXISTS public.meeting_has_attendees_from_user_companies(text, uuid);
DROP FUNCTION IF EXISTS public.user_can_access_meeting_via_company(text, uuid);

-- Create new policy that allows:
-- 1. Users to view their own meetings (user_id = auth.uid())
-- 2. Users to view meetings linked to their companies (via company_id)
-- 3. Users to view meetings with attendees from their companies (via meeting_attendees)
-- 
-- IMPORTANT: To avoid recursion, we:
-- - Reference row columns directly (user_id, company_id, google_event_id) - these are safe
-- - Query companies table (no circular dependency)
-- - Query meeting_attendees table (no circular dependency)
-- - Use column references, not table references in subqueries
CREATE POLICY "Users can view their own meetings or company meetings"
ON public.meetings
FOR SELECT
USING (
  -- Method 1: User owns the meeting directly
  auth.uid() = user_id
  OR
  -- Method 2: Meeting is linked to a company the user owns (via company_id)
  -- Safe: Reference row's company_id column directly
  (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM public.companies 
      WHERE user_id = auth.uid()
    )
  )
  OR
  -- Method 3: Meeting has attendees from user's companies (via meeting_attendees)
  -- Safe: Reference row's google_event_id column directly, only query meeting_attendees and companies
  google_event_id IN (
    SELECT ma.meeting_event_id
    FROM public.meeting_attendees ma
    INNER JOIN public.companies c ON ma.company_id = c.company_id
    WHERE c.user_id = auth.uid()
  )
);

-- Update the comment
COMMENT ON POLICY "Users can view their own meetings or company meetings" ON public.meetings IS 
  'Allows users to view meetings they own OR meetings linked to their companies (via company_id or meeting_attendees). All checks are inline to avoid function call recursion.';
