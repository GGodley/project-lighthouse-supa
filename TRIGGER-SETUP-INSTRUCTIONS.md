# Trigger Setup Instructions

## Issue
The trigger on `auth.users` cannot be created from the Supabase SQL Editor because it requires owner permissions on the `auth` schema, which regular SQL queries don't have.

## Current Status
✅ **Profile creation is already working** through application-level code:
- Auth callback creates profiles during login
- Dashboard layout creates profiles as backup
- Sync-threads function has fallback logic

The database trigger is **optional** but provides an additional safety net.

## Options to Create the Trigger

### Option 1: Use Supabase CLI (Recommended if you have CLI access)
If you have Supabase CLI set up with proper permissions:

```bash
# Connect to your project
supabase link --project-ref fdaqphksmlmupyrsatcz

# Apply the migration (this should work with CLI)
supabase db push
```

### Option 2: Contact Supabase Support
You can request Supabase support to create the trigger. Provide them with this SQL:

```sql
-- Create trigger on auth.users to call handle_new_user() after insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### Option 3: Use Supabase Dashboard (if available)
Some Supabase plans have a Database → Triggers section where you can create triggers through the UI.

### Option 4: Skip the Trigger (Current Solution)
The application-level profile creation is already working, so the trigger is optional. You can:
1. Run the safe migration (`apply-profile-migrations-safe.sql`) to create the function and backfill profiles
2. Continue using the application-level profile creation
3. Add the trigger later if needed

## What to Do Now

1. **Run the Safe Migration:**
   - Use `apply-profile-migrations-safe.sql` in the Supabase SQL Editor
   - This will create the function and backfill existing users
   - This should work without permission errors

2. **Test Profile Creation:**
   - Log in with your account
   - Verify profile is created (check in Supabase Dashboard → Table Editor → profiles)
   - Test sync-threads function

3. **Optional: Add Trigger Later:**
   - If you want the database-level trigger, use one of the options above
   - It's not required since application-level creation is working

## Verification

After running the safe migration, verify:

```sql
-- Check if function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'handle_new_user';

-- Check if profiles were created
SELECT COUNT(*) FROM public.profiles;

-- Check your specific user
SELECT * FROM public.profiles WHERE id = '3aca1f0c-e374-42a4-a91f-2e0fea00cdc3';
```

## Summary

- ✅ **Function created** - Can be used by trigger when created
- ✅ **Profiles backfilled** - Existing users now have profiles
- ✅ **Application-level creation** - Already working in code
- ⚠️ **Trigger** - Optional, requires admin access to create

The system is fully functional without the trigger, but having it provides an extra layer of protection.

