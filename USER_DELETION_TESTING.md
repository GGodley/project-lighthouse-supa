# User Deletion Testing Guide

## Prerequisites

1. **Environment Variables**
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in your `.env.local` file
   - This key is required to use the Admin API

2. **Access**
   - You need admin access or the service role key to delete users
   - The endpoint is protected and should only be accessible to admins

## Testing the Delete User API

### Option 1: Using cURL

#### Preview what will be deleted (GET request):
```bash
curl -X GET "http://localhost:3000/api/admin/delete-user?userId=USER_UUID_HERE" \
  -H "Content-Type: application/json"
```

#### Delete a user (DELETE request):
```bash
curl -X DELETE "http://localhost:3000/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_UUID_HERE"}'
```

### Option 2: Using a REST Client (Postman, Insomnia, etc.)

**GET Request (Preview):**
- Method: `GET`
- URL: `http://localhost:3000/api/admin/delete-user?userId=USER_UUID_HERE`
- Headers: `Content-Type: application/json`

**DELETE Request:**
- Method: `DELETE`
- URL: `http://localhost:3000/api/admin/delete-user`
- Headers: `Content-Type: application/json`
- Body (JSON):
  ```json
  {
    "userId": "USER_UUID_HERE"
  }
  ```

### Option 3: Using JavaScript/TypeScript

```typescript
// Preview what will be deleted
const previewResponse = await fetch(
  `http://localhost:3000/api/admin/delete-user?userId=${userId}`
)
const previewData = await previewResponse.json()
console.log('Data that will be deleted:', previewData)

// Delete the user
const deleteResponse = await fetch(
  'http://localhost:3000/api/admin/delete-user',
  {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  }
)
const deleteData = await deleteResponse.json()
console.log('Deletion result:', deleteData)
```

## Step-by-Step Testing Process

### 1. Create a Test User

1. Sign up a new test account via OAuth (Google/Microsoft)
2. Note the user's email and UUID (you can find this in Supabase dashboard)

### 2. Generate Test Data

1. Log in as the test user
2. Sync emails to create:
   - Companies
   - Customers
   - Threads
   - Thread messages
   - Domain blocklist entries (if you archive/delete companies)
3. Create some meetings if possible
4. Add some next steps

### 3. Preview Deletion (GET Request)

Before deleting, preview what will be deleted:

```bash
curl -X GET "http://localhost:3000/api/admin/delete-user?userId=TEST_USER_UUID"
```

Expected response:
```json
{
  "user": {
    "id": "...",
    "email": "test@example.com",
    "createdAt": "..."
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

### 4. Delete the User (DELETE Request)

```bash
curl -X DELETE "http://localhost:3000/api/admin/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "TEST_USER_UUID"}'
```

Expected response:
```json
{
  "success": true,
  "message": "User test@example.com (uuid) has been deleted successfully",
  "deleted": {
    "userId": "...",
    "email": "test@example.com",
    "profileDeleted": true,
    "companiesDeleted": true
  }
}
```

### 5. Verify Deletion

#### Check via SQL (Supabase Dashboard):
```sql
-- All of these should return 0 rows
SELECT COUNT(*) FROM profiles WHERE id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM companies WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM threads WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM thread_messages WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM meetings WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM emails WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM customers WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM domain_blocklist WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM next_steps WHERE user_id = 'TEST_USER_UUID';
SELECT COUNT(*) FROM transcription_jobs WHERE user_id = 'TEST_USER_UUID';
```

#### Check via API:
```bash
# This should return 404 (user not found)
curl -X GET "http://localhost:3000/api/admin/delete-user?userId=TEST_USER_UUID"
```

### 6. Verify Cascade Deletion

Check that related data was also deleted:

```sql
-- Check that customers linked to deleted companies are gone
SELECT COUNT(*) FROM customers c
JOIN companies co ON c.company_id = co.company_id
WHERE co.user_id = 'TEST_USER_UUID';
-- Should return 0

-- Check that thread_company_link entries are gone
SELECT COUNT(*) FROM thread_company_link tcl
JOIN companies co ON tcl.company_id = co.company_id
WHERE co.user_id = 'TEST_USER_UUID';
-- Should return 0

-- Check that next_steps for deleted companies are gone
SELECT COUNT(*) FROM next_steps ns
JOIN companies co ON ns.company_id = co.company_id
WHERE co.user_id = 'TEST_USER_UUID';
-- Should return 0
```

## Expected Behavior

✅ **What Should Happen:**
- User is deleted from `auth.users`
- Profile is deleted (cascade)
- All companies are deleted (cascade)
- All threads are deleted (cascade)
- All thread_messages are deleted (cascade)
- All thread_company_link entries are deleted (cascade)
- All meetings are deleted (cascade)
- All emails are deleted (cascade)
- All customers are deleted (cascade from profile)
- All domain_blocklist entries are deleted (cascade)
- All next_steps are deleted (cascade)
- All transcription_jobs are deleted (cascade)
- All related data is removed (no orphaned records)

❌ **What Should NOT Happen:**
- User still exists in `auth.users`
- Any orphaned records in related tables
- Partial deletion (some data remains)

## Troubleshooting

### Error: "User not found"
- Verify the user ID is correct
- Check that the user exists in Supabase dashboard

### Error: "Server configuration error"
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Restart your development server after adding the key

### Error: "Failed to delete user"
- Check Supabase logs for detailed error messages
- Verify you have admin permissions
- Check that RLS policies aren't blocking the deletion

### User deleted but data remains
- This should not happen if cascade deletes are properly configured
- Check database foreign key constraints
- Verify all tables have `ON DELETE CASCADE` on their foreign keys

## Security Considerations

⚠️ **Important Security Notes:**

1. **Protect the Endpoint**
   - In production, add authentication/authorization middleware
   - Only allow admins to access this endpoint
   - Consider rate limiting

2. **Service Role Key**
   - Never expose the service role key to the client
   - Keep it secure in environment variables
   - Rotate it regularly

3. **Audit Logging**
   - Consider adding audit logs for user deletions
   - Log who deleted which user and when

4. **Backup Before Deletion**
   - Consider creating a backup before deleting users
   - This allows recovery if deletion was accidental

## Production Deployment

Before deploying to production:

1. Add authentication middleware to the endpoint
2. Add authorization checks (only admins can delete users)
3. Add audit logging
4. Consider adding a "soft delete" option (mark as deleted instead of hard delete)
5. Add confirmation steps (e.g., require admin password)
6. Set up monitoring/alerts for user deletions

