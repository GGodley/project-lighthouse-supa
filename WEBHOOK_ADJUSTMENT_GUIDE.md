# 🔗 Webhook Adjustment Guide: Unified Orchestrator

This guide details the exact webhook changes needed for the unified orchestrator architecture.

## 📋 Current Webhook Setup

You currently have 7 webhooks:

1. ✅ **Webhook 1**: `trigger-page-worker` → `sync-threads-page-worker` (KEEP)
2. ❌ **Webhook 2**: `trigger-thread-importer` → `sync-threads-importer` (DISABLE)
3. ❌ **Webhook 3**: `trigger-thread-preprocessor` → `sync-threads-preprocessor` (DISABLE)
4. ❌ **Webhook 4**: `trigger-thread-cleaner` → `sync-threads-cleaner` (DISABLE)
5. ❌ **Webhook 5**: `trigger-thread-chunker` → `sync-threads-chunker` (DISABLE)
6. ✅ **Webhook 6**: `trigger-thread-summarizer` → `sync-threads-summarizer` (KEEP)
7. ✅ **Webhook 7**: `trigger-completion-checker` → `sync-threads-completion-checker` (KEEP)

## 🎯 New Webhook Setup

After migration, you'll have 4 webhooks:

1. ✅ **Webhook 1**: `trigger-page-worker` → `sync-threads-page-worker` (UNCHANGED)
2. 🆕 **Webhook 2**: `trigger-thread-processor` → `sync-threads-processor` (NEW)
3. ✅ **Webhook 3**: `trigger-thread-summarizer` → `sync-threads-summarizer` (UNCHANGED)
4. ✅ **Webhook 4**: `trigger-completion-checker` → `sync-threads-completion-checker` (UNCHANGED)

---

## 📝 Step-by-Step Webhook Changes

### Step 1: Create New Webhook

Navigate to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks**

**Click "Create New Webhook"**

**Configuration:**
- **Name**: `trigger-thread-processor`
- **Table**: `thread_processing_stages`
- **Events**: 
  - ✅ **Insert** (checked)
  - ❌ **Update** (unchecked)
  - ❌ **Delete** (unchecked)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-processor`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
    > **Note**: Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key from: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/settings/api
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `pending`
- **Advanced Options**: None needed

**Click "Save"**

---

### Step 2: Disable Old Stage Webhooks

For each of these webhooks, go to their settings and toggle to **"Inactive"**:

#### Webhook 2: `trigger-thread-importer`
1. Find the webhook in the list
2. Click on it to open settings
3. Toggle status to **"Inactive"** or **"Disabled"**
4. Save

#### Webhook 3: `trigger-thread-preprocessor`
1. Find the webhook in the list
2. Click on it to open settings
3. Toggle status to **"Inactive"** or **"Disabled"**
4. Save

#### Webhook 4: `trigger-thread-cleaner`
1. Find the webhook in the list
2. Click on it to open settings
3. Toggle status to **"Inactive"** or **"Disabled"**
4. Save

#### Webhook 5: `trigger-thread-chunker`
1. Find the webhook in the list
2. Click on it to open settings
3. Toggle status to **"Inactive"** or **"Disabled"**
4. Save

**⚠️ Important**: Don't delete them yet - keep for rollback if needed.

---

### Step 3: Verify Active Webhooks

After changes, you should have:

**Active Webhooks:**
- ✅ `trigger-page-worker` (Table: `sync_page_queue`, Event: INSERT)
- ✅ `trigger-thread-processor` (Table: `thread_processing_stages`, Event: INSERT)
- ✅ `trigger-thread-summarizer` (Table: `thread_summarization_queue`, Event: INSERT)
- ✅ `trigger-completion-checker` (Table: `thread_processing_stages`, Event: UPDATE)

**Inactive Webhooks (for rollback):**
- ⏸️ `trigger-thread-importer`
- ⏸️ `trigger-thread-preprocessor`
- ⏸️ `trigger-thread-cleaner`
- ⏸️ `trigger-thread-chunker`

---

## 🔍 Verification

### Check Webhook Status

1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
2. Verify webhook statuses:
   - New webhook shows as **"Active"** (green)
   - Old webhooks show as **"Inactive"** (gray)

### Test Webhook Execution

1. **Initiate a test sync** from the frontend
2. **Check webhook execution logs**:
   - Click on `trigger-thread-processor`
   - View "Execution History"
   - Should see webhook firing for each thread INSERT

3. **Verify no cascade**:
   - Old stage webhooks should NOT fire
   - Only `trigger-thread-processor` should fire for thread processing

---

## 📊 Webhook Flow Comparison

### Before (Multi-Webhook Cascade):
```
Page Worker creates 10 threads
→ 10 INSERTs into thread_processing_stages
→ 10 webhooks fire (importer)
→ Each processes 5 threads → 50 UPDATEs
→ 50 webhooks fire (preprocessor)
→ Each processes 5 threads → 250 UPDATEs
→ CASCADE EXPLOSION 💥
```

### After (Unified Orchestrator):
```
Page Worker creates 10 threads
→ 10 INSERTs into thread_processing_stages
→ 10 webhooks fire (processor)
→ Each processes 1 thread through ALL stages
→ 10 function invocations total
→ NO CASCADE ✅
```

---

## 🐛 Troubleshooting

### New Webhook Not Firing

**Check:**
1. Is webhook status "Active"?
2. Is filter correct? (`current_stage = 'pending'`)
3. Are threads being inserted with `current_stage = 'pending'`?

**Fix:**
- Verify webhook configuration
- Check thread_processing_stages table for new inserts
- Review webhook execution logs

### Old Webhooks Still Firing

**Check:**
1. Are old webhooks marked as "Inactive"?
2. Check webhook execution history

**Fix:**
- Ensure old webhooks are disabled
- If still firing, delete them (after confirming new system works)

### Multiple Webhooks Firing for Same Thread

**Check:**
1. Are there duplicate webhooks?
2. Is filter too broad?

**Fix:**
- Review webhook list for duplicates
- Ensure filter is specific (`current_stage = 'pending'`)

---

## 🔄 Rollback

If you need to rollback:

1. **Disable new webhook**: `trigger-thread-processor`
2. **Re-enable old webhooks**: Webhooks 2-5
3. **Verify**: Old system resumes operation

---

## ✅ Success Criteria

Webhook adjustment is successful when:
- ✅ New webhook is active and firing
- ✅ Old stage webhooks are inactive
- ✅ No webhook cascade occurs
- ✅ Threads process through all stages
- ✅ CPU usage is stable

---

**Webhook adjustment complete!** 🎉

