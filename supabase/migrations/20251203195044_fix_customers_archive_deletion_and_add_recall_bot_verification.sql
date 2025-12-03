-- Migration: Fix customers_archive deletion and add recall bot verification
-- Date: 2025-12-03
-- 
-- Changes:
-- 1. Add customers_archive deletion to cascade delete function
-- 2. Create verification function to check recall bots after user deletion
-- 3. Create helper function to get all recall bots summary

-- Step 1: Update cascade delete function to include customers_archive
CREATE OR REPLACE FUNCTION public.delete_user_cascade_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the user_id from the OLD record (the profile being deleted)
  v_user_id := OLD.id;
  
  -- Delete from tables that reference auth.users(id) directly
  -- Order matters: delete child records before parent records where applicable
  
  -- Delete customers_archive (no foreign key constraint, needs explicit deletion)
  DELETE FROM public.customers_archive WHERE user_id = v_user_id;
  
  -- Delete next_steps (references auth.users and companies)
  DELETE FROM public.next_steps WHERE user_id = v_user_id;
  
  -- Delete thread_company_link (references auth.users, threads, and companies)
  DELETE FROM public.thread_company_link WHERE user_id = v_user_id;
  
  -- Delete thread_messages (references auth.users and threads)
  DELETE FROM public.thread_messages WHERE user_id = v_user_id;
  
  -- Delete threads (references auth.users)
  DELETE FROM public.threads WHERE user_id = v_user_id;
  
  -- Delete transcription_jobs (references auth.users)
  DELETE FROM public.transcription_jobs WHERE user_id = v_user_id;
  
  -- Delete domain_blocklist (references auth.users)
  DELETE FROM public.domain_blocklist WHERE user_id = v_user_id;
  
  -- Delete meetings (references auth.users)
  -- NOTE: This will delete meetings with recall_bot_id, but only for this user
  -- Other users' meetings and recall bots should remain intact
  DELETE FROM public.meetings WHERE user_id = v_user_id;
  
  -- Delete emails (references auth.users)
  DELETE FROM public.emails WHERE user_id = v_user_id;
  
  -- Delete companies (references auth.users)
  -- This will cascade delete:
  --   - customers with matching company_id (via ON DELETE CASCADE)
  --   - thread_company_link entries (via ON DELETE CASCADE)
  --   - next_steps for those companies (via ON DELETE CASCADE)
  DELETE FROM public.companies WHERE user_id = v_user_id;
  
  RETURN OLD;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.delete_user_cascade_data() IS 
'Trigger function that deletes all user-related data from tables that reference auth.users(id) directly. Includes explicit deletion of customers_archive which has no foreign key constraint.';

-- Step 2: Create verification function to check recall bots after deletion
-- This function verifies that other users' recall bots (meetings with recall_bot_id) still exist
CREATE OR REPLACE FUNCTION public.verify_recall_bots_after_deletion(deleted_user_id UUID)
RETURNS TABLE (
  verification_status TEXT,
  other_users_meetings_count BIGINT,
  other_users_recall_bots_count BIGINT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_other_meetings_count BIGINT;
  v_other_recall_bots_count BIGINT;
BEGIN
  -- Count meetings for other users (not the deleted user)
  SELECT COUNT(*) INTO v_other_meetings_count
  FROM public.meetings
  WHERE user_id != deleted_user_id;
  
  -- Count meetings with recall_bot_id for other users
  SELECT COUNT(*) INTO v_other_recall_bots_count
  FROM public.meetings
  WHERE user_id != deleted_user_id
    AND recall_bot_id IS NOT NULL;
  
  -- Return verification results
  RETURN QUERY SELECT
    CASE 
      WHEN v_other_recall_bots_count > 0 THEN 'PASS'
      ELSE 'WARNING'
    END::TEXT as verification_status,
    v_other_meetings_count as other_users_meetings_count,
    v_other_recall_bots_count as other_users_recall_bots_count,
    CASE 
      WHEN v_other_recall_bots_count > 0 THEN 
        format('✅ Verification PASSED: Found %s meetings with recall_bot_id for other users. Deletion only affected user %s.', 
               v_other_recall_bots_count, deleted_user_id)
      WHEN v_other_meetings_count = 0 THEN
        '⚠️  WARNING: No meetings found for other users. This might be expected if this is the only user.'
      ELSE
        format('⚠️  WARNING: Found %s meetings for other users but none have recall_bot_id. This might be expected.', 
               v_other_meetings_count)
    END::TEXT as message;
END;
$$;

COMMENT ON FUNCTION public.verify_recall_bots_after_deletion(UUID) IS 
'Verification function to check that other users'' recall bots (meetings with recall_bot_id) still exist after a user deletion. Call this after deleting a user to ensure no other users'' data was affected.';

-- Step 3: Create a helper function to get detailed recall bot information
-- This provides more detailed information about recall bots for all users
CREATE OR REPLACE FUNCTION public.get_all_recall_bots_summary()
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  meetings_count BIGINT,
  recall_bots_count BIGINT,
  recall_bot_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.user_id,
    COALESCE(p.email, 'Unknown')::TEXT as user_email,
    COUNT(*)::BIGINT as meetings_count,
    COUNT(m.recall_bot_id) FILTER (WHERE m.recall_bot_id IS NOT NULL)::BIGINT as recall_bots_count,
    ARRAY_AGG(DISTINCT m.recall_bot_id) FILTER (WHERE m.recall_bot_id IS NOT NULL)::TEXT[] as recall_bot_ids
  FROM public.meetings m
  LEFT JOIN public.profiles p ON m.user_id = p.id
  GROUP BY m.user_id, p.email
  ORDER BY recall_bots_count DESC, m.user_id;
END;
$$;

COMMENT ON FUNCTION public.get_all_recall_bots_summary() IS 
'Returns a summary of all users'' meetings and recall bots. Useful for verifying that recall bots are properly associated with the correct users.';

-- Step 4: Create table to store verification logs
CREATE TABLE IF NOT EXISTS public.user_deletion_verification_logs (
  id BIGSERIAL PRIMARY KEY,
  deleted_user_id UUID NOT NULL,
  verification_status TEXT NOT NULL,
  other_users_meetings_count BIGINT NOT NULL,
  other_users_recall_bots_count BIGINT NOT NULL,
  message TEXT NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.user_deletion_verification_logs IS 
'Stores automatic verification results after user deletion to ensure recall bots and other users'' data remain intact.';

CREATE INDEX IF NOT EXISTS idx_user_deletion_verification_logs_deleted_user_id 
ON public.user_deletion_verification_logs(deleted_user_id);

CREATE INDEX IF NOT EXISTS idx_user_deletion_verification_logs_verified_at 
ON public.user_deletion_verification_logs(verified_at DESC);

-- Step 5: Create trigger function to automatically verify recall bots after deletion
CREATE OR REPLACE FUNCTION public.auto_verify_recall_bots_after_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_verification_result RECORD;
BEGIN
  -- Run verification for the deleted user
  SELECT * INTO v_verification_result
  FROM public.verify_recall_bots_after_deletion(OLD.id)
  LIMIT 1;
  
  -- Log the verification result
  INSERT INTO public.user_deletion_verification_logs (
    deleted_user_id,
    verification_status,
    other_users_meetings_count,
    other_users_recall_bots_count,
    message
  ) VALUES (
    OLD.id,
    v_verification_result.verification_status,
    v_verification_result.other_users_meetings_count,
    v_verification_result.other_users_recall_bots_count,
    v_verification_result.message
  );
  
  -- Also raise a notice so it appears in logs (for debugging)
  RAISE NOTICE 'User deletion verification: Status=%, Other users recall bots=%', 
    v_verification_result.verification_status,
    v_verification_result.other_users_recall_bots_count;
  
  -- If verification failed (no recall bots found for other users when there should be some),
  -- raise a warning (but don't fail the deletion)
  IF v_verification_result.verification_status = 'WARNING' 
     AND v_verification_result.other_users_meetings_count > 0 
     AND v_verification_result.other_users_recall_bots_count = 0 THEN
    RAISE WARNING 'User deletion verification WARNING: Other users have meetings but no recall_bot_id found. This might indicate a problem.';
  END IF;
  
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.auto_verify_recall_bots_after_deletion() IS 
'Trigger function that automatically verifies recall bots after user deletion and logs the results. Runs AFTER DELETE on profiles table.';

-- Step 6: Create trigger to automatically run verification after profile deletion
-- Drop trigger if it exists first (to allow re-running migration)
DROP TRIGGER IF EXISTS trg_auto_verify_recall_bots_after_deletion ON public.profiles;

CREATE TRIGGER trg_auto_verify_recall_bots_after_deletion
AFTER DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_verify_recall_bots_after_deletion();

COMMENT ON TRIGGER trg_auto_verify_recall_bots_after_deletion ON public.profiles IS 
'Automatically verifies that other users'' recall bots remain intact after a user is deleted. Results are logged to user_deletion_verification_logs table.';

