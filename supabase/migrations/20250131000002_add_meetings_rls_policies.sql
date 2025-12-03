-- Add comprehensive RLS policies for meetings table and views
-- This ensures users can only access their own meetings via API

-- ============================================
-- MEETINGS TABLE POLICIES
-- ============================================

-- Ensure RLS is enabled (should already be, but be safe)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can insert their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can update their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can delete their own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Service role can manage all meetings" ON public.meetings;

-- Policy: Users can view only their own meetings
CREATE POLICY "Users can view their own meetings"
ON public.meetings
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert meetings only for themselves
CREATE POLICY "Users can insert their own meetings"
ON public.meetings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update only their own meetings
CREATE POLICY "Users can update their own meetings"
ON public.meetings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete only their own meetings
CREATE POLICY "Users can delete their own meetings"
ON public.meetings
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Service role can manage all meetings (for edge functions)
CREATE POLICY "Service role can manage all meetings"
ON public.meetings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- MONITORING VIEWS ACCESS CONTROL
-- ============================================

-- Revoke access from anonymous and public users
REVOKE ALL ON public.meetings_requiring_attention FROM anon, public;
REVOKE ALL ON public.meetings_stuck_in_processing FROM anon, public;
REVOKE ALL ON public.meetings_with_high_retry_count FROM anon, public;
REVOKE ALL ON public.meetings_missing_urls FROM anon, public;

-- Grant SELECT access to authenticated users (views will respect RLS from underlying table)
GRANT SELECT ON public.meetings_requiring_attention TO authenticated;
GRANT SELECT ON public.meetings_stuck_in_processing TO authenticated;
GRANT SELECT ON public.meetings_with_high_retry_count TO authenticated;
GRANT SELECT ON public.meetings_missing_urls TO authenticated;

-- Service role can access all views
GRANT SELECT ON public.meetings_requiring_attention TO service_role;
GRANT SELECT ON public.meetings_stuck_in_processing TO service_role;
GRANT SELECT ON public.meetings_with_high_retry_count TO service_role;
GRANT SELECT ON public.meetings_missing_urls TO service_role;

-- Add comments
COMMENT ON POLICY "Users can view their own meetings" ON public.meetings IS 
  'Ensures users can only view meetings where they are the owner (user_id matches auth.uid())';

COMMENT ON POLICY "Users can update their own meetings" ON public.meetings IS 
  'Ensures users can only update meetings where they are the owner (user_id matches auth.uid())';

COMMENT ON POLICY "Users can delete their own meetings" ON public.meetings IS 
  'Ensures users can only delete meetings where they are the owner (user_id matches auth.uid())';

COMMENT ON POLICY "Service role can manage all meetings" ON public.meetings IS 
  'Allows service role (edge functions) to manage all meetings for system operations';

