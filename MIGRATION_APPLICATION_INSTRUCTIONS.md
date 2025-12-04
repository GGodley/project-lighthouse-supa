# Migration Application Instructions

## Status Summary

✅ **Git**: All changes are committed and ready
- Migration file: `supabase/migrations/20251111184448_create_profile_cascade_delete_function.sql`
- API endpoint: `src/app/api/admin/delete-user/route.ts`
- Documentation: Updated

## Applying Migration to Remote Supabase

Since you're using a Vercel-deployed site with a remote Supabase instance, you need to apply the migration to your remote database.

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project (ref: `fdaqphksmlmupyrsatcz`)
3. Navigate to **SQL Editor**
4. Copy the contents of `supabase/migrations/20251111184448_create_profile_cascade_delete_function.sql`
5. Paste and execute the SQL in the SQL Editor
6. Verify the function and trigger were created:
   ```sql
   -- Check function exists
   SELECT proname FROM pg_proc WHERE proname = 'delete_user_cascade_data';
   
   -- Check trigger exists
   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_profile_cascade_delete';
   ```

### Option 2: Supabase CLI (If Linked)

If your Supabase CLI is linked to your remote project:

```bash
# Make sure you're linked to the remote project
supabase link --project-ref fdaqphksmlmupyrsatcz

# Push the migration
supabase db push
```

### Option 3: Manual SQL Execution

If the CLI is having issues, you can run the SQL directly in the Supabase Dashboard SQL Editor.

## Verification

After applying the migration, verify it works:

1. **Check function exists:**
   ```sql
   SELECT proname, prosrc 
   FROM pg_proc 
   WHERE proname = 'delete_user_cascade_data';
   ```

2. **Check trigger exists:**
   ```sql
   SELECT tgname, tgrelid::regclass 
   FROM pg_trigger 
   WHERE tgname = 'trg_profile_cascade_delete';
   ```

3. **Test deletion** (with a test user):
   ```sql
   -- Preview what will be deleted
   SELECT COUNT(*) FROM profiles WHERE id = 'test-user-id';
   SELECT COUNT(*) FROM companies WHERE user_id = 'test-user-id';
   
   -- Delete the profile (trigger will handle cascade)
   DELETE FROM public.profiles WHERE id = 'test-user-id';
   
   -- Verify everything is deleted
   SELECT COUNT(*) FROM companies WHERE user_id = 'test-user-id';
   -- Should return 0
   ```

## Files Changed

1. ✅ `supabase/migrations/20251111184448_create_profile_cascade_delete_function.sql` - Migration file
2. ✅ `src/app/api/admin/delete-user/route.ts` - Updated API endpoint
3. ✅ `USER_DELETION_ANALYSIS.md` - Updated documentation
4. ✅ `USER_DELETION_SUMMARY.md` - Updated documentation

All files are committed to git and ready.


