# 🛑 Emergency Stop: Thread Processing

This guide helps you immediately stop all thread sync processing to reduce CPU load.

## 🚨 Quick Stop (3 Steps)

### Step 1: Run SQL to Pause All Jobs

Run this SQL in your Supabase SQL Editor:
```sql
-- See: stop_all_thread_processing.sql
```

This will:
- Mark all running sync jobs as `paused`
- Mark all pending/processing pages as `paused`
- Mark all pending/processing threads as `paused`
- Mark all pending/processing summarization jobs as `paused`

### Step 2: Disable Webhooks (Supabase Dashboard)

Navigate to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks**

**Disable these webhooks** (toggle to "Inactive"):

1. ✅ `trigger-page-worker` - Stops new page processing
2. ✅ `trigger-thread-processor` - Stops thread processing (if using unified orchestrator)
3. ✅ `trigger-thread-importer` - Stops thread import (if still active)
4. ✅ `trigger-thread-preprocessor` - Stops preprocessing (if still active)
5. ✅ `trigger-thread-cleaner` - Stops cleaning (if still active)
6. ✅ `trigger-thread-chunker` - Stops chunking (if still active)
7. ✅ `trigger-thread-summarizer` - Stops summarization
8. ✅ `trigger-completion-checker` - Stops completion checks

**How to disable:**
- Click on each webhook
- Toggle the "Active" switch to OFF
- Click "Save"

### Step 3: Verify Processing Has Stopped

Check function invocations:
- Go to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/functions**
- Click on any function (e.g., `sync-threads-processor`)
- Check "Logs" tab - should see no new invocations

Check CPU usage:
- Go to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/settings/infrastructure**
- Monitor CPU usage - should drop within 1-2 minutes

---

## 🔄 Resume Processing Later

When ready to resume:

### Option 1: Resume Specific Jobs

```sql
-- Resume a specific sync job
UPDATE sync_jobs
SET status = 'running'
WHERE id = YOUR_JOB_ID;

-- This will trigger webhooks to process pending work
```

### Option 2: Resume All Jobs

1. **Re-enable webhooks** (toggle back to "Active")
2. **Resume jobs**:
```sql
-- Resume all paused sync jobs
UPDATE sync_jobs
SET status = 'running'
WHERE status = 'paused';

-- Resume all paused pages
UPDATE sync_page_queue
SET status = 'pending',
    next_retry_at = NOW()
WHERE status = 'paused';

-- Resume all paused threads
UPDATE thread_processing_stages
SET current_stage = 'pending',
    next_retry_at = NULL
WHERE current_stage = 'paused';

-- Resume all paused summarization jobs
UPDATE thread_summarization_queue
SET status = 'pending'
WHERE status = 'paused';
```

---

## 🧹 Clean Up Stuck Jobs (Optional)

If you want to completely cancel jobs instead of pausing:

```sql
-- Cancel all running sync jobs
UPDATE sync_jobs
SET status = 'failed',
    details = 'Cancelled to reduce CPU load'
WHERE status IN ('running', 'paused');

-- Cancel all pending pages
UPDATE sync_page_queue
SET status = 'failed',
    error_message = 'Cancelled to reduce CPU load'
WHERE status IN ('pending', 'processing', 'retrying', 'paused');

-- Cancel all pending threads
UPDATE thread_processing_stages
SET current_stage = 'failed',
    import_error = 'Cancelled to reduce CPU load'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'paused');

-- Cancel all pending summarization jobs
UPDATE thread_summarization_queue
SET status = 'failed',
    error_message = 'Cancelled to reduce CPU load'
WHERE status IN ('pending', 'processing', 'paused');
```

---

## 📊 Monitor CPU Usage

After stopping:
1. Wait 1-2 minutes for functions to finish current invocations
2. Check CPU usage in dashboard
3. Should see significant drop in CPU usage

---

## ⚠️ Important Notes

- **Paused jobs** can be resumed later
- **Failed jobs** cannot be automatically resumed (would need manual intervention)
- **Webhooks** must be disabled to prevent new processing
- **Existing function invocations** may take 1-2 minutes to complete

---

## 🆘 If CPU Still High After Stopping

1. Check for long-running function invocations:
   - Go to Functions dashboard
   - Check "Logs" for any stuck invocations
   - May need to wait for them to timeout (5-10 minutes)

2. Check database connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   ```
   If high, may need to restart Supabase project (last resort)

3. Check for other processes:
   - Review other webhooks/triggers
   - Check for scheduled jobs (CRON)
   - Review other Edge Functions

