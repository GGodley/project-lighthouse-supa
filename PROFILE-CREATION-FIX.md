# Profile Creation Fix

## Problem

New users were able to sign in successfully, but the `sync-threads` edge function was failing with the error:
```
Could not fetch profile for user ID: 3aca1f0c-e374-42a4-a91f-2e0fea00cdc3
```

**Root Cause:** 
- Profiles were not being automatically created when new users signed up
- The auth callback (`src/app/auth/callback/route.ts`) only exchanges the OAuth code for a session - it doesn't create a profile
- There was no database trigger to automatically create profiles when users sign up
- The `sync-threads` function expects a profile to exist and fails when it doesn't

## Solution

I've implemented a three-part fix:

### 1. Automatic Profile Creation Trigger (Migration: `20251111190000_auto_create_profile_on_signup.sql`)

Created a database trigger that automatically creates a profile record when a new user is inserted into `auth.users`. This ensures all future signups will have profiles created automatically.

**What it does:**
- Triggers on `AFTER INSERT` on `auth.users`
- Extracts user information (email, provider, full_name) from the auth record
- Creates a corresponding profile in `public.profiles`
- Uses `SECURITY DEFINER` to bypass RLS when creating the profile

### 2. Backfill Migration (Migration: `20251111190001_backfill_missing_profiles.sql`)

Creates profiles for any existing users who don't have a profile yet. This fixes the issue for users who signed up before the trigger was added.

### 3. Fallback in sync-threads Function

Updated the `sync-threads` edge function to handle missing profiles gracefully:
- If a profile doesn't exist, it attempts to create one from `auth.users` data
- This provides a safety net in case the trigger fails or is bypassed
- Provides better error messages if profile creation fails

## How to Apply

### Step 1: Apply Migrations

Run the migrations in your Supabase project:

```bash
# If using Supabase CLI locally
supabase migration up

# Or apply via Supabase Dashboard:
# 1. Go to Database > Migrations
# 2. Apply the new migration files:
#    - 20251111190000_auto_create_profile_on_signup.sql
#    - 20251111190001_backfill_missing_profiles.sql
```

### Step 2: Deploy Updated Edge Function

The `sync-threads` function has been updated with fallback logic. Deploy it:

```bash
# If using Supabase CLI
supabase functions deploy sync-threads

# Or deploy via Supabase Dashboard:
# 1. Go to Edge Functions > sync-threads
# 2. Deploy the updated code
```

### Step 3: Fix Existing User

For the user who is currently experiencing the issue (ID: `3aca1f0c-e374-42a4-a91f-2e0fea00cdc3`), you have two options:

**Option A: Run the backfill migration** (Recommended)
- The backfill migration will automatically create a profile for this user
- Just apply the migration and the profile will be created

**Option B: Manual fix via SQL**
```sql
-- Get user info from auth.users
SELECT id, email, raw_app_meta_data, raw_user_meta_data 
FROM auth.users 
WHERE id = '3aca1f0c-e374-42a4-a91f-2e0fea00cdc3';

-- Create profile manually (replace values with actual data from above query)
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  provider,
  provider_id,
  created_at,
  updated_at
) VALUES (
  '3aca1f0c-e374-42a4-a91f-2e0fea00cdc3',
  'user@example.com',  -- Replace with actual email
  NULL,  -- Or actual full_name if available
  'google',  -- Or 'microsoft' based on provider
  'user@example.com',  -- Or actual provider_id
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
```

## Testing

After applying the migrations:

1. **Test new user signup:**
   - Sign up with a new account
   - Verify that a profile is automatically created in `public.profiles`
   - Try syncing threads - it should work without errors

2. **Test existing user:**
   - The backfill migration should have created a profile for existing users
   - Verify the profile exists: `SELECT * FROM public.profiles WHERE id = 'USER_ID';`
   - Try syncing threads - it should work now

3. **Test sync-threads function:**
   - The function should now handle missing profiles gracefully
   - If a profile is missing, it will attempt to create one automatically
   - Check the function logs to verify the fallback logic works

## Files Changed

1. **New Migration:** `supabase/migrations/20251111190000_auto_create_profile_on_signup.sql`
   - Creates trigger function and trigger on `auth.users`

2. **New Migration:** `supabase/migrations/20251111190001_backfill_missing_profiles.sql`
   - Backfills profiles for existing users

3. **Updated:** `supabase/functions/sync-threads/index.ts`
   - Added fallback logic to create profile if missing
   - Improved error messages

## Notes

- The trigger uses `SECURITY DEFINER` to ensure it can insert into `profiles` even if RLS would normally block it
- The trigger includes `ON CONFLICT DO NOTHING` to prevent errors if a profile already exists
- The sync-threads fallback provides an additional safety net, but the trigger should handle most cases
- All profile creation respects the existing RLS policies on the `profiles` table

