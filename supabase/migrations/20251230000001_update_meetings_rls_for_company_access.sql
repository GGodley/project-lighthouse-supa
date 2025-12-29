-- Update meetings RLS policy to allow viewing meetings linked to user's companies
-- This enables meetings to appear in interaction timeline even if they belong to different users
-- but are linked to companies the current user owns
--
-- This updates the policy created in 20250131000002_add_meetings_rls_policies.sql
-- Replaces the restrictive "Users can view their own meetings" policy with an expanded version

-- Drop the existing restrictive policy (from 20250131000002_add_meetings_rls_policies.sql)
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;

-- Create new policy that allows:
-- 1. Users to view their own meetings (user_id = auth.uid())
-- 2. Users to view meetings linked to their companies (via company_id or meeting_attendees)
CREATE POLICY "Users can view their own meetings or company meetings"
ON public.meetings
FOR SELECT
USING (
  -- Method 1: User owns the meeting directly
  auth.uid() = user_id
  OR
  -- Method 2: Meeting is linked to a company the user owns (via company_id)
  (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM public.companies 
      WHERE user_id = auth.uid()
    )
  )
  OR
  -- Method 3: Meeting has attendees linked to companies the user owns (via meeting_attendees)
  (
    EXISTS (
      SELECT 1 
      FROM public.meeting_attendees ma
      JOIN public.companies c ON ma.company_id = c.company_id
      WHERE ma.meeting_event_id = meetings.google_event_id
        AND c.user_id = auth.uid()
    )
  )
);

-- Update the comment
COMMENT ON POLICY "Users can view their own meetings or company meetings" ON public.meetings IS 
  'Allows users to view meetings they own OR meetings linked to their companies (via company_id or meeting_attendees)';

