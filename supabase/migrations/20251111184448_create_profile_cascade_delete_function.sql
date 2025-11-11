-- Create function to cascade delete all user data when profile is deleted
-- This function deletes data from tables that reference auth.users(id) directly
-- since deleting from profiles won't automatically cascade to those tables

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

-- Add comment to function
COMMENT ON FUNCTION public.delete_user_cascade_data() IS 
'Trigger function that deletes all user-related data from tables that reference auth.users(id) directly. Called by trigger when a profile is deleted.';

-- Create trigger that fires BEFORE DELETE on profiles table
-- This ensures all related data is deleted before the profile row is removed
CREATE OR REPLACE TRIGGER trg_profile_cascade_delete                        
BEFORE DELETE ON public.profiles                                             
FOR EACH ROW                                                                 
EXECUTE FUNCTION public.delete_user_cascade_data();

-- Add comment to trigger
COMMENT ON TRIGGER trg_profile_cascade_delete ON public.profiles IS 
'Trigger that automatically deletes all user-related data when a profile is deleted. Handles cascade deletion for tables that reference auth.users(id) directly.';

