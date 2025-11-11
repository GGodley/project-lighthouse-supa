# User Deletion Analysis & Cascade Delete Behavior

## Overview

This document explains how user deletion works in the database and what data gets deleted when a user is removed.

## Key Finding: ✅ **Cascade Delete Works via Database Trigger**

When you delete a user from the `profiles` table, a database trigger automatically removes **all associated data** across the entire database. The trigger `trg_profile_cascade_delete` fires BEFORE DELETE on `profiles` and calls the function `delete_user_cascade_data()` to clean up all data from tables that reference `auth.users(id)` directly.

## Database Schema & Cascade Relationships

### Direct References to `auth.users(id)` (ON DELETE CASCADE)

These tables will be **automatically deleted** when a user is deleted from `auth.users`:

1. **profiles** - User profile data
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: email, full_name, avatar_url, provider info, access tokens

2. **companies** - Company records
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: company data, health scores, MRR, renewal dates

3. **threads** - Email threads
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: thread summaries, LLM summaries

4. **thread_messages** - Individual email messages
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: email content, metadata

5. **thread_company_link** - Links between threads and companies
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: thread-company relationships

6. **meetings** - Meeting records
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: meeting summaries, topics, sentiment

7. **emails** (legacy table) - Email records
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: email data

8. **domain_blocklist** - Blocked domains
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: archived/deleted domain list

9. **next_steps** - Next steps tracking
   - References: `auth.users(id) ON DELETE CASCADE`
   - Contains: action items from threads/meetings

10. **transcription_jobs** - Transcription job records
    - References: `auth.users(id) ON DELETE CASCADE`
    - Contains: AssemblyAI transcription data

### References to `profiles(id)` (ON DELETE CASCADE)

These tables reference the profile, which will be deleted when `auth.users` is deleted:

1. **customers** - Customer records
   - References: `profiles(id) ON DELETE CASCADE`
   - Will be deleted when profile is deleted

2. **clients** - Client records (legacy)
   - References: `profiles(id) ON DELETE CASCADE`
   - Will be deleted when profile is deleted

3. **tickets** - Support tickets
   - References: `profiles(id) ON DELETE CASCADE`
   - Will be deleted when profile is deleted

4. **events** - Calendar events
   - References: `profiles(id) ON DELETE CASCADE`
   - Will be deleted when profile is deleted

### Secondary Cascade Relationships

When companies are deleted, these related records are also deleted:

- **thread_company_link** entries (ON DELETE CASCADE)
- **customers** with matching `company_id` (ON DELETE CASCADE)
- **next_steps** for that company (ON DELETE CASCADE)
- **thread_messages.customer_id** set to NULL (ON DELETE SET NULL)

When threads are deleted:
- **thread_messages** are deleted (ON DELETE CASCADE)
- **thread_company_link** entries are deleted (ON DELETE CASCADE)

## Onboarding Process

### Current Flow

1. **User Authentication**
   - User visits `/` or `/login`
   - Clicks "Continue with Google" or Microsoft OAuth
   - OAuth provider redirects to `/auth/callback?code=...`

2. **Auth Callback** (`src/app/auth/callback/route.ts`)
   - Exchanges authorization code for session
   - Creates Supabase session
   - Redirects to `/dashboard`

3. **Profile Creation**
   - Profile is created **manually** in the application code (not via database trigger)
   - Profile creation happens when needed (e.g., in settings page or dashboard)
   - Profile references `auth.users(id)` with `ON DELETE CASCADE`

4. **Data Sync**
   - User can sync emails via `SyncEmailsButton`
   - Edge functions (`sync-emails`, `sync-threads`) create:
     - Companies (from email domains)
     - Customers (from email senders)
     - Threads and thread_messages
     - Thread-company links

## How to Delete a User

### Option 1: Delete via API Endpoint (Recommended)

Use the admin API endpoint to delete the user from `profiles`. The database trigger will automatically handle cascade deletion.

```bash
curl -X DELETE "http://localhost:3000/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-uuid-here"}'
```

### Option 2: Delete via SQL (Direct Database Access)

```sql
-- This will trigger the cascade delete function automatically
DELETE FROM public.profiles WHERE id = 'user-uuid-here';
```

The trigger `trg_profile_cascade_delete` will automatically:
1. Call `delete_user_cascade_data(user_id)` to delete all data from tables referencing `auth.users(id)`
2. Then delete the profile row
3. Tables referencing `profiles(id)` will cascade delete via foreign key constraints

### What Gets Deleted

When you delete from `profiles`, the following cascade happens:

**Trigger Function Execution (BEFORE DELETE):**
1. ✅ **next_steps** → Deleted by trigger function
2. ✅ **thread_company_link** → Deleted by trigger function
3. ✅ **thread_messages** → Deleted by trigger function
4. ✅ **threads** → Deleted by trigger function
5. ✅ **transcription_jobs** → Deleted by trigger function
6. ✅ **domain_blocklist** → Deleted by trigger function
7. ✅ **meetings** → Deleted by trigger function
8. ✅ **emails** → Deleted by trigger function
9. ✅ **companies** → Deleted by trigger function (cascades to customers, thread_company_link, next_steps)

**Foreign Key Cascade (ON DELETE CASCADE):**
10. ✅ **profiles** → Deleted (the row being deleted)
11. ✅ **customers** → Deleted (cascade from profiles)
12. ✅ **clients** → Deleted (cascade from profiles)
13. ✅ **tickets** → Deleted (cascade from profiles)
14. ✅ **events** → Deleted (cascade from profiles)
15. ✅ **summarization_jobs** → Deleted (cascade from emails)

## Important Notes

1. **Delete from `profiles` table**
   - Deleting from `profiles` triggers the cascade deletion automatically
   - The database trigger `trg_profile_cascade_delete` handles all cleanup
   - You do NOT need to delete from `auth.users` directly

2. **Database Trigger Mechanism**
   - The trigger fires BEFORE DELETE on `profiles`
   - It calls `delete_user_cascade_data(user_id)` function
   - The function deletes all data from tables referencing `auth.users(id)` directly
   - Then the profile row is deleted, which cascades to tables referencing `profiles(id)`

3. **RLS Policies**
   - Row Level Security policies prevent users from deleting other users' data
   - Admin functions must use service role key to bypass RLS

4. **No Orphaned Data**
   - All foreign keys use `ON DELETE CASCADE` or `ON DELETE SET NULL`
   - The trigger function ensures complete cleanup
   - No orphaned records should remain after user deletion

5. **Profile Creation**
   - Profiles are created manually in the app, not via database trigger
   - If a user exists in `auth.users` but not in `profiles`, you can still delete the profile if it exists
   - The profile will be created when needed, or can be created manually

## Database Trigger Details

### Function: `delete_user_cascade_data(user_id UUID)`

This function is called by the trigger and deletes data from all tables that reference `auth.users(id)` directly:

- `next_steps` - Next steps tracking
- `thread_company_link` - Thread-company relationships
- `thread_messages` - Individual email messages
- `threads` - Email threads
- `transcription_jobs` - Transcription job records
- `domain_blocklist` - Blocked domains
- `meetings` - Meeting records
- `emails` - Email records (legacy)
- `companies` - Company records (also cascades to related customers, thread_company_link, next_steps)

### Trigger: `trg_profile_cascade_delete`

- **Type**: BEFORE DELETE
- **Table**: `public.profiles`
- **Function**: `delete_user_cascade_data(OLD.id)`
- **Purpose**: Ensures all user data is deleted before the profile row is removed

## Testing User Deletion

To test user deletion:

1. Create a test user account
2. Sync some emails to create data (companies, customers, threads, etc.)
3. Delete the user via API endpoint or SQL:
   ```sql
   DELETE FROM public.profiles WHERE id = 'user-uuid-here';
   ```
4. Verify all related data is removed:
   ```sql
   -- Check that user data is gone
   SELECT COUNT(*) FROM profiles WHERE id = 'user-uuid';
   SELECT COUNT(*) FROM companies WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM threads WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM customers WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM thread_messages WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM meetings WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM emails WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM domain_blocklist WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM next_steps WHERE user_id = 'user-uuid';
   SELECT COUNT(*) FROM transcription_jobs WHERE user_id = 'user-uuid';
   -- All should return 0
   ```

