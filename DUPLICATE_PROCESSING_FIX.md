# Duplicate Processing Fix - Implementation Summary

## Problem Identified

The logs showed duplicate processing of threads, with the same thread completing stages multiple times. The root cause was:

1. **Multiple rows per thread**: The same `thread_id` appeared multiple times in `thread_processing_stages` for the same `sync_job_id`
2. **No atomic locking**: Multiple `sync-threads-processor` instances could claim and process the same thread simultaneously
3. **Missing unique constraint**: The database allowed duplicate `(thread_id, sync_job_id)` combinations

## Fixes Implemented

### 1. Atomic Locking in `sync-threads-processor` ✅

**File**: `supabase/functions/sync-threads-processor/index.ts`

**Changes**:
- Implemented truly atomic thread claiming using `UPDATE ... WHERE` with strict conditions
- Only claims threads in `'pending'` or `'failed'` states
- If another instance already claimed a thread, the UPDATE returns no rows (no race condition)
- Automatically resumes from the correct stage based on existing progress flags
- Skips threads that are already fully completed

**Key Logic**:
```typescript
// Atomically claim: only update if thread is in a claimable state
const { data: claimed } = await supabaseAdmin
  .from('thread_processing_stages')
  .update({ current_stage: 'importing', updated_at: now })
  .eq('id', id)
  .in('current_stage', ['pending', 'failed']) // Only claim these states
  .select()
  .single();
```

### 2. Idempotent Thread Insertion in `sync-threads-page-worker` ✅

**File**: `supabase/functions/sync-threads-page-worker/index.ts`

**Status**: Already implemented correctly with `upsert` and `onConflict: 'thread_id,sync_job_id'`

**Note**: This requires the unique constraint (see #3) to work properly.

### 3. Database Unique Constraint ✅

**File**: `supabase/migrations/20251210000000_add_unique_constraint_thread_processing_stages.sql`

**Changes**:
- Cleans up existing duplicate rows (keeps most recent per `thread_id + sync_job_id`)
- Adds `UNIQUE (thread_id, sync_job_id)` constraint
- Creates index for faster lookups

**SQL to Apply**:
```sql
-- See: supabase/migrations/20251210000000_add_unique_constraint_thread_processing_stages.sql
```

### 4. Completion State Management ✅

**File**: `supabase/functions/sync-threads-processor/index.ts`

**Changes**:
- After processing all stages (1-4), ensures thread is in correct state
- Marks thread as `'summarizing'` after chunking (summarizer will mark as `'completed'`)
- Prevents re-processing of already completed threads

## How It Works

1. **Page Worker** inserts threads with `upsert` - duplicates are automatically prevented by unique constraint
2. **Processor** atomically claims threads using `UPDATE ... WHERE` - only one instance can claim a specific thread
3. **Processor** resumes from correct stage based on existing progress flags
4. **Processor** skips threads that are already completed

## Testing

After applying the SQL migration and deploying the updated functions:

1. Check for duplicate rows:
   ```sql
   SELECT thread_id, sync_job_id, COUNT(*) as count
   FROM thread_processing_stages
   GROUP BY thread_id, sync_job_id
   HAVING COUNT(*) > 1;
   ```
   Should return 0 rows after cleanup.

2. Monitor logs for duplicate processing:
   - Should no longer see the same thread completing stages multiple times
   - Each thread should only appear once per sync job

3. Verify atomic claiming:
   - Multiple webhook triggers for the same thread should result in only one successful claim
   - Other instances should return "No threads to process or already being processed"

## Deployment Steps

1. **Apply SQL Migration**:
   ```sql
   -- Run: supabase/migrations/20251210000000_add_unique_constraint_thread_processing_stages.sql
   ```

2. **Deploy Updated Functions**:
   ```bash
   supabase functions deploy sync-threads-processor --project-ref YOUR_PROJECT_REF
   ```

3. **Verify**:
   - Check that duplicate rows are cleaned up
   - Monitor function logs for duplicate processing
   - Test with a new sync job

## Notes

- The unique constraint will prevent new duplicates from being created
- Existing duplicates will be cleaned up by the migration (keeps most recent)
- Atomic locking ensures only one processor instance works on a thread at a time
- The processor automatically resumes from the correct stage if a thread was partially processed

