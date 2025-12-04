# User Deletion Verification Guide

## Overview

**✅ Automatic Verification**: Verification now runs automatically via a database trigger! Every time a user is deleted, the system automatically:
1. Verifies that other users' recall bots are still intact
2. Logs the verification results to `user_deletion_verification_logs` table
3. Raises warnings if any issues are detected

You can still manually run verification functions if needed, but the automatic trigger ensures you never forget to check.

## Automatic Verification

### How It Works

When you delete a user from the `profiles` table:
1. The `BEFORE DELETE` trigger runs `delete_user_cascade_data()` to delete all user data
2. The profile row is deleted
3. The `AFTER DELETE` trigger automatically runs `auto_verify_recall_bots_after_deletion()`
4. Verification results are logged to `user_deletion_verification_logs` table

### Viewing Verification Logs

To see all verification results:

```sql
-- View all verification logs (most recent first)
SELECT * FROM public.user_deletion_verification_logs 
ORDER BY verified_at DESC;

-- View logs for a specific deleted user
SELECT * FROM public.user_deletion_verification_logs 
WHERE deleted_user_id = 'deleted-user-uuid-here'
ORDER BY verified_at DESC;

-- View only warnings/failures
SELECT * FROM public.user_deletion_verification_logs 
WHERE verification_status = 'WARNING'
ORDER BY verified_at DESC;
```

## Manual Verification Functions

You can still run these manually if needed:

### 1. Verify Recall Bots After Deletion

After deleting a user, run this to ensure other users' recall bots are still intact:

```sql
-- Replace 'deleted-user-uuid-here' with the actual user ID that was deleted
SELECT * FROM public.verify_recall_bots_after_deletion('deleted-user-uuid-here');
```

**Expected Output:**
- `verification_status`: Should be `PASS` if other users have recall bots
- `other_users_recall_bots_count`: Should be > 0 if there are other users with scheduled bots
- `message`: Will indicate if verification passed or if there are warnings

**Example:**
```
verification_status | other_users_meetings_count | other_users_recall_bots_count | message
--------------------|---------------------------|------------------------------|--------
PASS                | 45                        | 12                           | ✅ Verification PASSED: Found 12 meetings with recall_bot_id for other users. Deletion only affected user abc-123-def.
```

### 2. Get All Recall Bots Summary

To see all users' meetings and recall bots across the system:

```sql
SELECT * FROM public.get_all_recall_bots_summary();
```

**Output:**
- `user_id`: The user's UUID
- `user_email`: The user's email (from profiles table)
- `meetings_count`: Total meetings for this user
- `recall_bots_count`: Number of meetings with recall_bot_id
- `recall_bot_ids`: Array of all recall_bot_id values for this user

**Use Cases:**
- Before deletion: Check which users have recall bots
- After deletion: Verify the deleted user's bots are gone but others remain
- General audit: See the distribution of recall bots across users

## Complete Verification Checklist

After deleting a user, the automatic trigger handles recall bot verification. You can optionally run these additional checks:

### 1. Check Recall Bots
```sql
SELECT * FROM public.verify_recall_bots_after_deletion('deleted-user-id');
```

### 2. Verify User Data is Gone
```sql
-- All should return 0
SELECT COUNT(*) FROM public.profiles WHERE id = 'deleted-user-id';
SELECT COUNT(*) FROM public.companies WHERE user_id = 'deleted-user-id';
SELECT COUNT(*) FROM public.threads WHERE user_id = 'deleted-user-id';
SELECT COUNT(*) FROM public.meetings WHERE user_id = 'deleted-user-id';
SELECT COUNT(*) FROM public.customers_archive WHERE user_id = 'deleted-user-id';
SELECT COUNT(*) FROM public.customers WHERE user_id = 'deleted-user-id';
SELECT COUNT(*) FROM public.emails WHERE user_id = 'deleted-user-id';
```

### 3. Verify Other Users' Data is Intact
```sql
-- Should show other users still have their data
SELECT * FROM public.get_all_recall_bots_summary();

-- Check other users' meetings count
SELECT user_id, COUNT(*) as meetings_count 
FROM public.meetings 
GROUP BY user_id 
ORDER BY meetings_count DESC;
```

## What Was Fixed

### Issue: customers_archive Not Being Deleted
- **Problem**: The `customers_archive` table has a `user_id` column but no foreign key constraint, so it wasn't being deleted via CASCADE
- **Solution**: Added explicit deletion of `customers_archive` records in the `delete_user_cascade_data()` function

### Issue: Recall Bots Verification
- **Problem**: No way to verify that other users' recall bots weren't accidentally deleted, and easy to forget to check
- **Solution**: 
  - Created verification functions to check recall bot integrity after user deletion
  - Added automatic trigger that runs verification after every user deletion
  - Created `user_deletion_verification_logs` table to store all verification results

## Migration Details

Migration file: `20251203195044_fix_customers_archive_deletion_and_add_recall_bot_verification.sql`

This migration:
1. ✅ Updates `delete_user_cascade_data()` to delete `customers_archive` records
2. ✅ Creates `verify_recall_bots_after_deletion()` function (manual verification)
3. ✅ Creates `get_all_recall_bots_summary()` function (audit tool)
4. ✅ Creates `user_deletion_verification_logs` table (stores automatic verification results)
5. ✅ Creates `auto_verify_recall_bots_after_deletion()` trigger function (automatic verification)
6. ✅ Creates `trg_auto_verify_recall_bots_after_deletion` trigger (runs automatically after profile deletion)

## Notes

- The verification functions use `SECURITY DEFINER` so they can access all data regardless of RLS policies
- The functions are safe to run multiple times
- The automatic trigger runs AFTER DELETE, so it won't slow down or interfere with the deletion process
- If you see warnings in the logs, investigate further - it might indicate a problem with the deletion process
- The trigger raises NOTICE and WARNING messages that appear in PostgreSQL logs for monitoring
- Verification results are permanently stored in `user_deletion_verification_logs` for audit purposes

