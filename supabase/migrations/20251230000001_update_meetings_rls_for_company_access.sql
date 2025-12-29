-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- SIMPLIFIED APPROACH: Uses company_id column directly from meetings table
-- Skips meeting_attendees for now to avoid recursion issues
--
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;

-- Drop any old helper functions (not needed for simplified approach)
DROP FUNCTION IF EXISTS public.meeting_has_attendees_from_user_companies(text, uuid);
DROP FUNCTION IF EXISTS public.user_can_access_meeting_via_company(text, uuid);
DROP FUNCTION IF EXISTS public.get_meeting_event_ids_for_user_companies(uuid);

-- ============================================
-- MULTIPLE SEPARATE POLICIES (PostgreSQL ORs them)
-- ============================================
-- Using separate policies is more robust and easier to maintain
-- PostgreSQL automatically ORs multiple policies for the same operation

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

-- Comments
COMMENT ON POLICY "Users can view their own meetings" ON public.meetings IS 
  'Allows users to view meetings they own directly (user_id = auth.uid())';

COMMENT ON POLICY "Users can view meetings linked to their companies" ON public.meetings IS 
  'Allows users to view meetings linked to their companies via company_id column. Queries companies table only, avoiding recursion.';
