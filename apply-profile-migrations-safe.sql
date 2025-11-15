-- ============================================
-- PROFILE CREATION FIX - SAFE MIGRATION
-- ============================================
-- This version creates the function and backfills profiles
-- The trigger on auth.users requires admin permissions and must be created separately
-- ============================================

-- ============================================
-- STEP 1: Create the Profile Creation Function
-- ============================================
-- This function will be used by the trigger (when we can create it)
-- It can also be called manually if needed

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_provider_id TEXT;
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  -- Extract provider from app_metadata (e.g., 'google' or 'microsoft')
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'google');
  
  -- Extract provider_id from app_metadata or use email as fallback
  v_provider_id := COALESCE(
    NEW.raw_app_meta_data->>'provider_id',
    NEW.raw_user_meta_data->>'provider_id',
    NEW.email
  );
  
  -- Get email from auth.users
  v_email := NEW.email;
  
  -- Get full_name from user_metadata if available
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULL
  );
  
  -- Insert profile record
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    provider,
    provider_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_provider,
    v_provider_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent errors if profile already exists
  
  RETURN NEW;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION public.handle_new_user() IS 
'Automatically creates a profile record when a new user is inserted into auth.users. Extracts email, provider, and other metadata from the auth.users record.';

-- ============================================
-- STEP 2: Backfill Existing Users
-- ============================================
-- This creates profiles for any existing users who don't have one yet

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  provider,
  provider_id,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    NULL
  ) as full_name,
  COALESCE(u.raw_app_meta_data->>'provider', 'google') as provider,
  COALESCE(
    u.raw_app_meta_data->>'provider_id',
    u.raw_user_meta_data->>'provider_id',
    u.email
  ) as provider_id,
  u.created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users. Profiles are automatically created via trigger when new users sign up.';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after the migrations to verify everything worked

-- Check total profiles
SELECT COUNT(*) as total_profiles FROM public.profiles;

-- Check specific user (replace with your user ID)
SELECT * FROM public.profiles WHERE id = '3aca1f0c-e374-42a4-a91f-2e0fea00cdc3';

-- List all users and their profiles
SELECT 
  u.id as user_id,
  u.email,
  p.id as profile_id,
  p.email as profile_email,
  p.provider
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC;

-- Verify function exists
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';

-- ============================================
-- NOTE: TRIGGER CREATION REQUIRES ADMIN ACCESS
-- ============================================
-- The trigger on auth.users cannot be created from the SQL Editor
-- because it requires owner permissions on the auth schema.
--
-- OPTIONS:
-- 1. The application-level profile creation (auth callback + dashboard layout)
--    already handles profile creation, so the trigger is optional.
--
-- 2. To create the trigger, you would need to:
--    - Use Supabase CLI with admin access, OR
--    - Contact Supabase support to create it, OR
--    - Use a Supabase extension/plugin if available
--
-- Since we've already implemented profile creation in the code,
-- the trigger is a nice-to-have but not required for functionality.

