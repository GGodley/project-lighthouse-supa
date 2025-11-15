# Manual Migration Guide - Profile Creation Fix

This guide shows you how to manually apply the migrations via the Supabase Dashboard SQL Editor.

## Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **My Project** (fdaqphksmlmupyrsatcz)
3. Navigate to: **SQL Editor** (in the left sidebar)
4. Click **New Query**

### Step 2: Run Migration 1 - Auto-Create Profile Trigger

Copy and paste the following SQL into the SQL Editor:

```sql
-- Create function to automatically create a profile when a new user signs up
-- This function is called by a trigger on auth.users AFTER INSERT

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

-- Create trigger on auth.users to call handle_new_user() after insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add comment to trigger
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 
'Trigger that automatically creates a profile record in public.profiles when a new user signs up.';
```

**Click "Run"** (or press `Ctrl+Enter` / `Cmd+Enter`)

**Expected Result:** You should see "Success. No rows returned"

### Step 3: Run Migration 2 - Backfill Existing Users

Copy and paste the following SQL into the SQL Editor:

```sql
-- Backfill profiles for existing users who don't have a profile yet
-- This migration creates profiles for any users in auth.users who don't have a corresponding profile

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
```

**Click "Run"** (or press `Ctrl+Enter` / `Cmd+Enter`)

**Expected Result:** You should see "Success. X rows inserted" (where X is the number of users who didn't have profiles)

### Step 4: Verify the Migration

Run this query to verify that profiles were created:

```sql
-- Check how many profiles exist
SELECT COUNT(*) as total_profiles FROM public.profiles;

-- Check if the specific user has a profile
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
```

### Step 5: Verify the Trigger

Check that the trigger was created:

```sql
-- Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

**Expected Result:** You should see one row with the trigger details

## Troubleshooting

### If you get a permission error:
- Make sure you're logged in as a project owner or have the necessary permissions
- The function uses `SECURITY DEFINER` which should handle permissions automatically

### If the backfill doesn't create profiles:
- Check if there are any users without profiles:
  ```sql
  SELECT u.id, u.email 
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE p.id IS NULL;
  ```
- If users exist but profiles weren't created, check the error message in the SQL Editor

### If the trigger doesn't work:
- Verify the function exists:
  ```sql
  SELECT routine_name 
  FROM information_schema.routines 
  WHERE routine_name = 'handle_new_user';
  ```
- Check trigger status:
  ```sql
  SELECT * FROM information_schema.triggers 
  WHERE trigger_name = 'on_auth_user_created';
  ```

## What These Migrations Do

### Migration 1: Auto-Create Profile Trigger
- Creates a database function that automatically creates a profile when a new user signs up
- Sets up a trigger on `auth.users` that calls this function
- Extracts user information (email, provider, name) from the auth record
- Ensures all future signups will have profiles created automatically

### Migration 2: Backfill Existing Users
- Creates profiles for any existing users who don't have one
- Fixes the issue for the user `3aca1f0c-e374-42a4-a91f-2e0fea00cdc3` and any other users
- Safe to run multiple times (uses `ON CONFLICT DO NOTHING`)

## After Running Migrations

1. **Test with existing user:**
   - The user `3aca1f0c-e374-42a4-a91f-2e0fea00cdc3` should now have a profile
   - Try syncing threads - it should work now

2. **Test with new user:**
   - Sign up with a new account
   - The profile should be created automatically
   - Verify in the database that the profile exists

3. **Monitor:**
   - Check that new signups automatically get profiles
   - The sync-threads function should no longer fail with "Could not fetch profile" errors

## Quick Copy-Paste Commands

If you want to run both migrations at once, you can combine them:

```sql
-- ============================================
-- MIGRATION 1: Auto-Create Profile Trigger
-- ============================================

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
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'google');
  v_provider_id := COALESCE(
    NEW.raw_app_meta_data->>'provider_id',
    NEW.raw_user_meta_data->>'provider_id',
    NEW.email
  );
  v_email := NEW.email;
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULL
  );
  INSERT INTO public.profiles (
    id, email, full_name, provider, provider_id, created_at, updated_at
  ) VALUES (
    NEW.id, v_email, v_full_name, v_provider, v_provider_id, NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- MIGRATION 2: Backfill Existing Users
-- ============================================

INSERT INTO public.profiles (
  id, email, full_name, provider, provider_id, created_at, updated_at
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
```

This will run both migrations in sequence. Make sure to check the results after running!

