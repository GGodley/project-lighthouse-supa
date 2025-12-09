# 🚀 Migration Guide: Unified Thread Processor

This guide walks you through migrating from the multi-webhook cascade architecture to the unified orchestrator design.

## 📋 Overview

**Before**: Multiple webhooks trigger separate functions for each stage → Exponential cascade
**After**: Single webhook triggers unified processor → Processes thread through all stages in one invocation

## ✅ Step-by-Step Migration

### Step 1: Deploy the New Function

Deploy the unified processor function:

```bash
supabase functions deploy sync-threads-processor --project-ref fdaqphksmlmupyrsatcz
```

**Verify deployment:**
- Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/functions
- Confirm `sync-threads-processor` is listed and active

---

### Step 2: Create New Webhook (Single Orchestrator)

Navigate to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks**

**Create new webhook:**

- **Name**: `trigger-thread-processor`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Insert** (uncheck Update, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-processor`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: Leave empty
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `pending`
- **Advanced Options**: None needed

**Click "Save"**

---

### Step 3: Disable Old Stage Webhooks

Disable (but don't delete yet - keep for rollback) these webhooks:

1. **Webhook 2**: `trigger-thread-importer`
   - Go to webhook settings
   - Toggle to **"Inactive"** or **"Disabled"**

2. **Webhook 3**: `trigger-thread-preprocessor`
   - Toggle to **"Inactive"** or **"Disabled"**

3. **Webhook 4**: `trigger-thread-cleaner`
   - Toggle to **"Inactive"** or **"Disabled"**

4. **Webhook 5**: `trigger-thread-chunker`
   - Toggle to **"Inactive"** or **"Disabled"**

**Keep these webhooks active:**
- ✅ **Webhook 1**: `trigger-page-worker` (still needed)
- ✅ **Webhook 6**: `trigger-thread-summarizer` (summarization is still separate)
- ✅ **Webhook 7**: `trigger-completion-checker` (still needed)

---

### Step 4: Test with Small Batch

1. **Initiate a small sync** (1-2 threads) from the frontend
2. **Monitor Edge Function logs**:
   - Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/functions
   - Click on `sync-threads-processor`
   - View logs to see stages being processed

3. **Check database**:
   ```sql
   SELECT 
     thread_id,
     current_stage,
     stage_imported,
     stage_preprocessed,
     stage_body_cleaned,
     stage_chunked,
     created_at,
     updated_at
   FROM thread_processing_stages
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. **Verify stages complete**:
   - All stages should progress: `pending` → `importing` → `preprocessing` → `cleaning` → `chunking` → `summarizing`
   - Check that `stage_imported`, `stage_preprocessed`, `stage_body_cleaned`, `stage_chunked` all become `true`

---

### Step 5: Monitor for Issues

Watch for:
- ✅ Threads processing through all stages
- ✅ No duplicate processing
- ✅ No webhook cascade (check webhook execution logs)
- ✅ CPU usage remains stable
- ✅ No connection pool errors

**If issues occur:**
- Re-enable old webhooks
- Disable new webhook
- Investigate logs

---

### Step 6: Clean Up (After 24-48 hours of stable operation)

Once confirmed stable:

1. **Delete old webhooks** (Webhooks 2-5):
   - `trigger-thread-importer`
   - `trigger-thread-preprocessor`
   - `trigger-thread-cleaner`
   - `trigger-thread-chunker`

2. **Optional**: Archive old stage functions (keep for reference):
   - `sync-threads-importer`
   - `sync-threads-preprocessor`
   - `sync-threads-cleaner`
   - `sync-threads-chunker`

---

## 🔍 Verification Checklist

After migration, verify:

- [ ] New webhook `trigger-thread-processor` is active
- [ ] Old stage webhooks (2-5) are disabled
- [ ] Page worker webhook still active
- [ ] Summarizer webhook still active
- [ ] Completion checker webhook still active
- [ ] Test sync completes successfully
- [ ] No webhook cascade in logs
- [ ] CPU usage is stable
- [ ] Threads progress through all stages

---

## 🐛 Troubleshooting

### Threads Stuck at "pending"
- **Check**: Is the new webhook active?
- **Check**: Are there any errors in `sync-threads-processor` logs?
- **Fix**: Manually trigger the processor for stuck threads

### Threads Processing Multiple Times
- **Check**: Are old webhooks still active?
- **Fix**: Ensure old webhooks are disabled

### Stages Not Completing
- **Check**: Function logs for errors
- **Check**: Database for error messages in `*_error` columns
- **Fix**: Review error messages and retry logic

### High CPU Usage
- **Check**: Are multiple webhooks firing?
- **Check**: Webhook execution logs
- **Fix**: Ensure only one webhook is active per stage

---

## 📊 Expected Behavior

### Before (Multi-Webhook):
```
10 threads inserted
→ 10 webhooks fire (importer)
→ Each processes 5 threads → 50 UPDATEs
→ 50 webhooks fire (preprocessor)
→ CASCADE EXPLOSION
```

### After (Unified Orchestrator):
```
10 threads inserted
→ 10 webhooks fire (processor)
→ Each processes 1 thread through ALL stages
→ 10 function invocations total
→ NO CASCADE ✅
```

---

## 🎯 Success Criteria

Migration is successful when:
1. ✅ Threads process through all stages
2. ✅ No webhook cascade occurs
3. ✅ CPU usage is stable and predictable
4. ✅ No connection pool errors
5. ✅ Processing time is acceptable
6. ✅ Error handling works correctly

---

## 📝 Notes

- **Summarization remains separate**: Stage 5 (summarization) is still handled by `sync-threads-summarizer` to avoid blocking on OpenAI API calls
- **Page worker unchanged**: The page worker still creates thread entries, which now trigger the unified processor
- **Completion checker unchanged**: Still checks for job completion

---

## 🔄 Rollback Plan

If issues occur:

1. **Disable new webhook**: `trigger-thread-processor`
2. **Re-enable old webhooks**: Webhooks 2-5
3. **Monitor**: Check that old system resumes normal operation
4. **Investigate**: Review logs to identify issues
5. **Fix**: Address issues before re-attempting migration

---

**Migration complete!** 🎉

