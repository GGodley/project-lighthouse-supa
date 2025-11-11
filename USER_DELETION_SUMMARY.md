# User Deletion - Quick Summary

## Your Questions Answered

### ✅ Question 1: "I want to be able to delete a user from the database entirely"

**Answer:** ✅ **DONE** - I've created an admin API endpoint at `/api/admin/delete-user` that allows you to delete users completely.

**How to use it:**
```bash
# Delete a user
curl -X DELETE "http://localhost:3000/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_UUID_HERE"}'

# Preview what will be deleted first
curl -X GET "http://localhost:3000/api/admin/delete-user?userId=USER_UUID_HERE"
```

### ✅ Question 2: "I want to check the onboarding process from start to finish"

**Answer:** Here's the complete onboarding flow:

1. **User visits** `/` or `/login`
2. **Clicks OAuth** (Google/Microsoft) → Redirects to OAuth provider
3. **OAuth callback** → `/auth/callback?code=...`
4. **Auth callback** (`src/app/auth/callback/route.ts`):
   - Exchanges code for Supabase session
   - Creates authentication session
   - Redirects to `/dashboard`
5. **Dashboard loads** → Profile may be created if needed
6. **User syncs emails** → Creates companies, customers, threads, etc.

**Key Finding:** Profiles are created **manually** in the app code (not via database trigger). The profile is created when needed, typically when accessing settings or dashboard features.

### ✅ Question 3: "If I delete their profile will this cascade into deleting everything associated with them?"

**Answer:** ✅ **YES!** Deleting from `profiles` will now cascade delete everything automatically.

**How It Works:**
- ✅ Delete from `profiles` → Database trigger automatically deletes all related data
- ✅ A trigger `trg_profile_cascade_delete` fires BEFORE DELETE on `profiles`
- ✅ The trigger calls `delete_user_cascade_data()` function to clean up all data
- ✅ Tables referencing `profiles(id)` cascade delete via foreign key constraints

**What Gets Deleted When You Delete from `profiles`:**

✅ **Deleted by trigger function (references `auth.users`):**
- next_steps
- thread_company_link
- thread_messages
- threads
- transcription_jobs
- domain_blocklist
- meetings
- emails
- companies (also cascades to related customers, thread_company_link, next_steps)

✅ **Deleted via profile cascade (references `profiles`):**
- customers
- clients
- tickets
- events

✅ **Deleted via company cascade:**
- customers with matching company_id
- thread_company_link entries
- next_steps for those companies

**Total:** ~15+ tables get cleaned up automatically via database trigger! 🎉

## Quick Start

### 1. Set Environment Variable

Add to your `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 2. Test the Deletion

```bash
# Preview what will be deleted
curl -X GET "http://localhost:3000/api/admin/delete-user?userId=USER_UUID"

# Delete the user (deletes from profiles table, trigger handles cascade)
curl -X DELETE "http://localhost:3000/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_UUID"}'
```

**Note:** The deletion happens on the `profiles` table. A database trigger automatically handles cascade deletion of all related data.

### 3. Verify Everything is Deleted

All related data should be automatically removed. Check the response from the API or query the database.

## Files Created

1. **`src/app/api/admin/delete-user/route.ts`** - Admin API endpoint for user deletion
2. **`USER_DELETION_ANALYSIS.md`** - Detailed analysis of cascade delete behavior
3. **`USER_DELETION_TESTING.md`** - Complete testing guide
4. **`USER_DELETION_SUMMARY.md`** - This file (quick reference)

## Security Note

⚠️ **Before deploying to production:**
- Add authentication/authorization to the endpoint
- Only allow admins to access it
- Consider adding audit logging
- Add rate limiting

The endpoint currently requires the service role key but doesn't have additional auth checks. Add those before production use.

