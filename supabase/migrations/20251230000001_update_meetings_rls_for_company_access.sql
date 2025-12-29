-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql
-- Replaces the restrictive "Users can view their own meetings" policy with an expanded version
--
-- NOTE: Uses a SECURITY DEFINER function to avoid infinite recursion in RLS policy

-- Create helper function to check if meeting has attendees linked to user's companies
-- This function ONLY queries meeting_attendees (not meetings table) to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.meeting_has_attendees_from_user_companies(
  meeting_google_event_id text,
  user_uuid uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Check if meeting has attendees linked to companies the user owns
  -- This ONLY queries meeting_attendees table, NOT meetings table, so no recursion
  RETURN EXISTS (
    SELECT 1 
    FROM public.meeting_attendees ma
    JOIN public.companies c ON ma.company_id = c.company_id
    WHERE ma.meeting_event_id = meeting_google_event_id
      AND c.user_id = user_uuid
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.meeting_has_attendees_from_user_companies(text, uuid) TO authenticated;

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;

-- Create new policy that allows:
-- 1. Users to view their own meetings (user_id = auth.uid())
-- 2. Users to view meetings linked to their companies (via company_id - checked directly in policy)
-- 3. Users to view meetings with attendees from their companies (via helper function)
-- NOTE: We check company_id directly in the policy (no recursion) and use function only for meeting_attendees
CREATE POLICY "Users can view their own meetings or company meetings"
ON public.meetings
FOR SELECT
USING (
  -- Method 1: User owns the meeting directly
  auth.uid() = user_id
  OR
  -- Method 2: Meeting is linked to a company the user owns (via company_id)
  -- We check this directly in the policy - no recursion because we're not querying meetings table
  (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM public.companies 
      WHERE user_id = auth.uid()
    )
  )
  OR
  -- Method 3: Meeting has attendees from user's companies (via helper function - no recursion)
  public.meeting_has_attendees_from_user_companies(google_event_id, auth.uid())
);

-- Update the comment
COMMENT ON POLICY "Users can view their own meetings or company meetings" ON public.meetings IS 
  'Allows users to view meetings they own OR meetings linked to their companies (via company_id or meeting_attendees)';

COMMENT ON FUNCTION public.meeting_has_attendees_from_user_companies(text, uuid) IS 
  'Helper function to check if a meeting has attendees from user''s companies. Only queries meeting_attendees table to avoid RLS recursion.';
