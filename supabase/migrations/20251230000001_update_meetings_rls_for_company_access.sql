-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql
-- Replaces the restrictive "Users can view their own meetings" policy with an expanded version
--
-- NOTE: Uses a SECURITY DEFINER function to avoid infinite recursion in RLS policy

-- Create helper function to check if user can access a meeting via company link
-- This function bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.user_can_access_meeting_via_company(
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
  -- Check if meeting is linked to a company the user owns (via company_id)
  IF EXISTS (
    SELECT 1 
    FROM public.meetings m
    JOIN public.companies c ON m.company_id = c.company_id
    WHERE m.google_event_id = meeting_google_event_id
      AND c.user_id = user_uuid
  ) THEN
    RETURN true;
  END IF;

  -- Check if meeting has attendees linked to companies the user owns (via meeting_attendees)
  IF EXISTS (
    SELECT 1 
    FROM public.meeting_attendees ma
    JOIN public.companies c ON ma.company_id = c.company_id
    WHERE ma.meeting_event_id = meeting_google_event_id
      AND c.user_id = user_uuid
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_can_access_meeting_via_company(text, uuid) TO authenticated;

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view their own meetings or company meetings" ON public.meetings;

-- Create new policy that allows:
-- 1. Users to view their own meetings (user_id = auth.uid())
-- 2. Users to view meetings linked to their companies (via company_id or meeting_attendees)
-- Uses the helper function to avoid infinite recursion
CREATE POLICY "Users can view their own meetings or company meetings"
ON public.meetings
FOR SELECT
USING (
  -- Method 1: User owns the meeting directly
  auth.uid() = user_id
  OR
  -- Method 2 & 3: Meeting is linked to user's companies (via helper function to avoid recursion)
  public.user_can_access_meeting_via_company(google_event_id, auth.uid())
);

-- Update the comment
COMMENT ON POLICY "Users can view their own meetings or company meetings" ON public.meetings IS 
  'Allows users to view meetings they own OR meetings linked to their companies (via company_id or meeting_attendees)';

COMMENT ON FUNCTION public.user_can_access_meeting_via_company(text, uuid) IS 
  'Helper function to check if a user can access a meeting via company link. Uses SECURITY DEFINER to avoid RLS recursion.';
