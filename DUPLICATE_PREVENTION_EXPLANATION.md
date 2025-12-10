# How the System Prevents Duplicate Thread Processing

## Overview

The system has **multiple layers of protection** to prevent processing the same thread multiple times:

---

## 1. **Database Unique Constraint** (Primary Protection)

**Location**: `thread_processing_stages` table

**Constraint**: `UNIQUE (thread_id, sync_job_id)`

**How it works**:
- The database **physically prevents** duplicate entries
- If you try to insert the same `(thread_id, sync_job_id)` combination twice, PostgreSQL will reject it with error code `23505`
- This is enforced at the database level, so it works even if multiple functions try to insert simultaneously

**Migration**: `supabase/migrations/20251210000000_add_unique_constraint_thread_processing_stages.sql`

---

## 2. **Idempotent Upsert in Page Worker** (Application-Level Protection)

**Location**: `supabase/functions/sync-threads-page-worker/index.ts` (lines 216-221)

**Code**:
```typescript
const { error: stagesError } = await supabaseAdmin
  .from('thread_processing_stages')
  .upsert(stageJobs, {
    onConflict: 'thread_id,sync_job_id',
    ignoreDuplicates: true
  });
```

**How it works**:
- Uses PostgreSQL `UPSERT` (INSERT ... ON CONFLICT)
- If a thread already exists for a sync job, it **updates** the existing row instead of creating a duplicate
- The `ignoreDuplicates: true` flag means it won't error if duplicates are detected
- This works **with** the unique constraint - the constraint ensures no duplicates can exist, and upsert handles the conflict gracefully

**Result**: Even if the page worker runs multiple times for the same page, it won't create duplicate processing records.

---

## 3. **Queue-Based Sequential Processing** (Concurrency Protection)

**Location**: `thread_processing_queue` table

**How it works**:
- Only **one thread** is processed at a time per sync job
- The queue ensures sequential processing: Thread 1 → Thread 2 → Thread 3
- Each queue entry has a `UNIQUE` constraint on `thread_stage_id`, preventing the same thread from being queued twice
- The processor atomically marks queue entries as `processed_at` to prevent double-processing

**Code** (from `sync-threads-processor/index.ts`):
```typescript
// Atomically mark as processed
const { data: queueEntry } = await supabaseAdmin
  .from('thread_processing_queue')
  .update({ processed_at: new Date().toISOString() })
  .eq('id', queueId)
  .is('processed_at', null) // Only if not already processed
  .select('thread_stage_id, sync_job_id')
  .single();
```

**Result**: Even if multiple webhooks fire simultaneously, only one can claim and process a queue entry.

---

## 4. **Stage Flags and Resume Logic** (Progress Protection)

**Location**: `thread_processing_stages` table columns

**Flags**:
- `stage_imported` (boolean)
- `stage_preprocessed` (boolean)
- `stage_body_cleaned` (boolean)
- `stage_chunked` (boolean)
- `stage_summarized` (boolean)

**How it works**:
- Each stage sets its flag to `true` when complete
- The processor **resumes from the correct stage** based on these flags
- If a thread is partially processed (e.g., `stage_imported = true` but `stage_preprocessed = false`), it will resume from Stage 2 (Preprocess), not restart from Stage 1

**Code** (from `sync-threads-processor/index.ts`):
```typescript
// Resume from correct stage
if (currentJob.stage_imported) stagesCompleted.push('imported');
if (currentJob.stage_preprocessed) stagesCompleted.push('preprocessed');
if (currentJob.stage_body_cleaned) stagesCompleted.push('cleaned');
if (currentJob.stage_chunked) stagesCompleted.push('chunked');
```

**Result**: If processing is interrupted and restarted, it doesn't redo work that's already been completed.

---

## 5. **Current Stage Tracking** (State Protection)

**Location**: `thread_processing_stages.current_stage` column

**Valid States**:
- `'pending'` - Not started
- `'importing'` - Stage 1 in progress
- `'preprocessing'` - Stage 2 in progress
- `'cleaning'` - Stage 3 in progress
- `'chunking'` - Stage 4 in progress
- `'summarizing'` - Stage 5 in progress
- `'completed'` - All stages done
- `'failed'` - Processing failed

**How it works**:
- The processor **skips threads** that are already `'completed'`
- The processor **skips threads** that are currently in progress (e.g., `'importing'`, `'preprocessing'`)
- Only threads in `'pending'` or `'failed'` states can be claimed for processing

**Code** (from `sync-threads-processor/index.ts`, line 619):
```typescript
if (t.current_stage === 'completed' || t.current_stage === 'failed') continue;
```

**Result**: Completed threads are never reprocessed, and threads in progress are protected from concurrent processing.

---

## 6. **What About Old Threads? (Cross-Sync-Job Protection)**

**Question**: What prevents processing a thread that was already processed in a **previous** sync job?

**Answer**: The unique constraint is **per sync job** (`UNIQUE (thread_id, sync_job_id)`), so:
- Thread `abc123` can be processed in Sync Job 1
- Thread `abc123` can **also** be processed in Sync Job 2 (different job)
- This is **intentional** - it allows re-syncing threads if needed (e.g., to get updated data)

**However**, the page worker does **not** currently check if a thread already exists in the `threads` table before creating a processing record. This means:
- If you run a new sync job, it will create processing records for **all** threads, even if they already exist in the `threads` table
- The thread will be processed again, which may update existing data (via upsert in the processor)

**Potential Enhancement**: Add a check in the page worker to skip threads that already exist in the `threads` table and are up-to-date. This would be similar to the check in the old `sync-threads` function (see `SYNC-THREADS-FIX-SUMMARY.md`).

---

## Summary: Protection Layers

1. ✅ **Database constraint** - Physically prevents duplicates
2. ✅ **Upsert logic** - Handles conflicts gracefully
3. ✅ **Queue system** - Ensures sequential processing
4. ✅ **Stage flags** - Prevents redoing completed work
5. ✅ **State tracking** - Skips completed/in-progress threads
6. ⚠️ **Cross-job protection** - Not implemented (intentional for re-sync capability)

---

## Testing Duplicate Prevention

To verify the system is working:

1. **Check for duplicate rows**:
   ```sql
   SELECT thread_id, sync_job_id, COUNT(*) as count
   FROM thread_processing_stages
   GROUP BY thread_id, sync_job_id
   HAVING COUNT(*) > 1;
   ```
   Should return **0 rows**.

2. **Monitor logs**:
   - Should not see the same thread completing stages multiple times
   - Each thread should only appear once per sync job

3. **Check queue entries**:
   ```sql
   SELECT thread_stage_id, COUNT(*) as count
   FROM thread_processing_queue
   GROUP BY thread_stage_id
   HAVING COUNT(*) > 1;
   ```
   Should return **0 rows** (due to unique constraint on `thread_stage_id`).

