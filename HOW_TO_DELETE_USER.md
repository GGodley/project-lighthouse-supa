# How to Delete a User

## Overview

You can delete a user and all their associated data by calling the admin API endpoint. The deletion happens on the `profiles` table, and a database trigger automatically cascades to delete all related data.

## Prerequisites

1. **Migration Applied**: Make sure the migration `20251111184448_create_profile_cascade_delete_function.sql` has been applied to your Supabase database
2. **Service Role Key**: You need `SUPABASE_SERVICE_ROLE_KEY` set in your environment variables

## Method 1: Using cURL (Command Line)

### Preview What Will Be Deleted (GET)

First, check what data exists for a user before deleting:

```bash
curl -X GET "https://your-vercel-app.vercel.app/api/admin/delete-user?userId=USER_UUID_HERE" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "createdAt": "2025-01-01T00:00:00Z"
  },
  "dataCounts": {
    "profiles": 1,
    "companies": 5,
    "threads": 10,
    "threadMessages": 50,
    "meetings": 2,
    "emails": 20,
    "customers": 8,
    "blocklistEntries": 1,
    "nextSteps": 3,
    "transcriptionJobs": 0
  },
  "totalRecords": 100
}
```

### Delete the User (DELETE)

```bash
curl -X DELETE "https://your-vercel-app.vercel.app/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_UUID_HERE"}'
```

**Response:**
```json
{
  "success": true,
  "message": "User user@example.com (user-uuid) has been deleted successfully",
  "deleted": {
    "userId": "user-uuid",
    "email": "user@example.com",
    "profileDeleted": true,
    "companiesDeleted": true
  }
}
```

## Method 2: Using JavaScript/TypeScript

```typescript
// Preview what will be deleted
async function previewUserDeletion(userId: string) {
  const response = await fetch(
    `https://your-vercel-app.vercel.app/api/admin/delete-user?userId=${userId}`
  );
  const data = await response.json();
  console.log('Data that will be deleted:', data);
  return data;
}

// Delete the user
async function deleteUser(userId: string) {
  const response = await fetch(
    'https://your-vercel-app.vercel.app/api/admin/delete-user',
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    }
  );
  const data = await response.json();
  console.log('Deletion result:', data);
  return data;
}

// Usage
const userId = 'user-uuid-here';
await previewUserDeletion(userId);
await deleteUser(userId);
```

## Method 3: Using Supabase Dashboard SQL Editor

You can also delete directly via SQL (useful for testing):

```sql
-- Preview what will be deleted
SELECT 
  (SELECT COUNT(*) FROM profiles WHERE id = 'user-uuid-here') as profiles,
  (SELECT COUNT(*) FROM companies WHERE user_id = 'user-uuid-here') as companies,
  (SELECT COUNT(*) FROM threads WHERE user_id = 'user-uuid-here') as threads,
  (SELECT COUNT(*) FROM thread_messages WHERE user_id = 'user-uuid-here') as thread_messages,
  (SELECT COUNT(*) FROM meetings WHERE user_id = 'user-uuid-here') as meetings,
  (SELECT COUNT(*) FROM emails WHERE user_id = 'user-uuid-here') as emails,
  (SELECT COUNT(*) FROM customers WHERE user_id = 'user-uuid-here') as customers,
  (SELECT COUNT(*) FROM domain_blocklist WHERE user_id = 'user-uuid-here') as blocklist,
  (SELECT COUNT(*) FROM next_steps WHERE user_id = 'user-uuid-here') as next_steps,
  (SELECT COUNT(*) FROM transcription_jobs WHERE user_id = 'user-uuid-here') as transcription_jobs;

-- Delete the user (trigger will handle cascade)
DELETE FROM public.profiles WHERE id = 'user-uuid-here';

-- Verify deletion
SELECT COUNT(*) FROM profiles WHERE id = 'user-uuid-here';
-- Should return 0
```

## Method 4: Create an Admin UI (Optional)

You could create a simple admin page in your Next.js app:

```typescript
// src/app/admin/delete-user/page.tsx
'use client';

import { useState } from 'react';

export default function DeleteUserPage() {
  const [userId, setUserId] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const previewDeletion = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/delete-user?userId=${userId}`);
      const data = await res.json();
      setPreview(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone!')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      alert(data.message || 'User deleted successfully');
      setPreview(null);
      setUserId('');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Delete User</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block mb-2">User ID (UUID)</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="border p-2 w-full"
            placeholder="Enter user UUID"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={previewDeletion}
            disabled={!userId || loading}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Preview Deletion
          </button>
          <button
            onClick={deleteUser}
            disabled={!userId || loading || !preview}
            className="bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Delete User
          </button>
        </div>

        {preview && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <h2 className="font-bold mb-2">Preview:</h2>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

## What Gets Deleted

When you delete a user, the following cascade happens automatically:

1. **Trigger Function Executes** (BEFORE DELETE on profiles):
   - next_steps
   - thread_company_link
   - thread_messages
   - threads
   - transcription_jobs
   - domain_blocklist
   - meetings
   - emails
   - companies (also cascades to related customers)

2. **Profile Row Deleted**

3. **Foreign Key Cascade** (ON DELETE CASCADE):
   - customers
   - clients
   - tickets
   - events
   - summarization_jobs (via emails)

## Finding a User ID

To find a user's UUID:

1. **From Supabase Dashboard:**
   - Go to Authentication > Users
   - Find the user and copy their UUID

2. **From Database:**
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'user@example.com';
   ```

3. **From Profiles Table:**
   ```sql
   SELECT id, email FROM profiles WHERE email = 'user@example.com';
   ```

## Security Notes

⚠️ **Important:**
- This endpoint requires the service role key
- In production, add authentication/authorization
- Only allow admins to access this endpoint
- Consider adding rate limiting
- This action is **irreversible**

## Error Handling

Common errors:

- **400 Bad Request**: Invalid user ID format
- **404 Not Found**: Profile doesn't exist
- **500 Internal Server Error**: Server configuration issue or deletion failed

Check the response for details:
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```




