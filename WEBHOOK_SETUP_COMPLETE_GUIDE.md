# 🔗 Complete Webhook Setup Guide for Thread Sync

This guide provides **exact configurations** for all 7 webhooks needed for the thread sync system.

## 📋 Prerequisites

1. **Get Your Service Role Key**:
   - Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/settings/api
   - Find **"service_role"** key (⚠️ Keep this secret!)
   - Copy it - you'll need it for all webhook headers

2. **Verify Edge Functions Are Deployed**:
   - All 7 edge functions must be deployed before setting up webhooks
   - Functions: `sync-threads-orchestrator`, `sync-threads-page-worker`, `sync-threads-importer`, `sync-threads-preprocessor`, `sync-threads-cleaner`, `sync-threads-chunker`, `sync-threads-summarizer`, `sync-threads-completion-checker`

---

## 🚀 Webhook Setup Instructions

Navigate to: **https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks**

> **📝 Note on HTTP Parameters**: Supabase webhooks use "HTTP Parameters" instead of "HTTP Body". For all webhooks below, **leave HTTP Parameters empty** - the Edge Functions query the database directly and don't require any request parameters.

---

### Webhook 1: Page Worker (Process Gmail API Pages)

**Purpose**: Automatically process Gmail API pages when new page jobs are created

**Configuration**:
- **Name**: `trigger-page-worker`
- **Table**: `sync_page_queue`
- **Events**: ✅ **Insert** (uncheck Update, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-page-worker`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `status`
  - **Operator**: `=`
  - **Value**: `pending`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `status`

**Click "Save"**

---

### Webhook 2: Importer Worker (Stage 1: Import Threads)

**Purpose**: Automatically import thread data from Gmail when threads are enqueued

**Configuration**:
- **Name**: `trigger-thread-importer`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Insert** (uncheck Update, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-importer`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `pending`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `current_stage`

**Click "Save"**

---

### Webhook 3: Preprocessor Worker (Stage 2: Company/Customer Discovery)

**Purpose**: Automatically discover companies/customers when threads are imported

**Configuration**:
- **Name**: `trigger-thread-preprocessor`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Update** (uncheck Insert, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-preprocessor`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `preprocessing`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `current_stage`

**Click "Save"**

---

### Webhook 4: Cleaner Worker (Stage 3: Body Text Cleaning)

**Purpose**: Automatically clean body text when threads are preprocessed

**Configuration**:
- **Name**: `trigger-thread-cleaner`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Update** (uncheck Insert, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-cleaner`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `cleaning`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `current_stage`

**Click "Save"**

---

### Webhook 5: Chunker Worker (Stage 4: Chunk Preparation)

**Purpose**: Automatically prepare chunks for OpenAI when body text is cleaned

**Configuration**:
- **Name**: `trigger-thread-chunker`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Update** (uncheck Insert, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-chunker`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `chunking`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `current_stage`

**Click "Save"**

---

### Webhook 6: Summarizer Worker (Stage 5: OpenAI Summarization)

**Purpose**: Automatically summarize threads when they're added to the summarization queue

**Configuration**:
- **Name**: `trigger-thread-summarizer`
- **Table**: `thread_summarization_queue`
- **Events**: ✅ **Insert** (uncheck Update, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-summarizer`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `status`
  - **Operator**: `=`
  - **Value**: `pending`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `status`

**Click "Save"**

---

### Webhook 7: Completion Checker (Mark Jobs as Completed)

**Purpose**: Automatically check if sync jobs are complete when threads finish processing

**Configuration**:
- **Name**: `trigger-completion-checker`
- **Table**: `thread_processing_stages`
- **Events**: ✅ **Update** (uncheck Insert, Delete)
- **Type**: **HTTP Request**
- **HTTP Request**:
  - **Method**: `POST`
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-completion-checker`
  - **HTTP Headers**:
    ```
    Authorization: Bearer YOUR_SERVICE_ROLE_KEY
    Content-Type: application/json
    ```
  - **HTTP Parameters**: 
    - ⚠️ **Leave empty** - The function queries the database directly and doesn't need parameters
- **Filter**: 
  - **Column**: `current_stage`
  - **Operator**: `=`
  - **Value**: `completed`
- **Advanced Options**:
  - ✅ Enable **"Only trigger on specific column changes"**
  - Select column: `current_stage`

**Click "Save"**

---

## ✅ Verification Checklist

After setting up all 7 webhooks:

### 1. Verify All Webhooks Are Active
- Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
- Verify all 7 webhooks show as **"Active"** with green status
- Check that each webhook has the correct table and filter conditions

### 2. Verify Tables Exist
Run this in SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'thread_processing_stages',
    'sync_page_queue',
    'thread_summarization_queue'
  )
ORDER BY table_name;
```

**Expected**: 3 rows returned

### 3. Test the Flow
1. Initiate a thread sync from the frontend
2. Check Edge Function logs to see webhooks triggering
3. Monitor `sync_jobs` table - status should progress: `pending` → `running` → `completed`
4. Check `thread_processing_stages` - threads should progress through all stages

### 4. Check Webhook Logs
- Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
- Click on each webhook to view its execution history
- Verify webhooks are firing when expected

---

## 🔄 Complete Flow Overview

Here's how the webhook-driven thread sync works:

1. **User Initiates Sync** → Frontend calls `sync-threads-orchestrator`
2. **Orchestrator** → Creates `sync_job` and first `sync_page_queue` entry
3. **Webhook 1** → `sync_page_queue` INSERT triggers `sync-threads-page-worker`
4. **Page Worker** → Processes Gmail API page, creates `thread_processing_stages` entries
5. **Webhook 2** → `thread_processing_stages` INSERT triggers `sync-threads-importer`
6. **Importer** → Fetches thread data, updates stage to `preprocessing`
7. **Webhook 3** → `thread_processing_stages` UPDATE triggers `sync-threads-preprocessor`
8. **Preprocessor** → Discovers companies/customers, updates stage to `cleaning`
9. **Webhook 4** → `thread_processing_stages` UPDATE triggers `sync-threads-cleaner`
10. **Cleaner** → Cleans body text, updates stage to `chunking`
11. **Webhook 5** → `thread_processing_stages` UPDATE triggers `sync-threads-chunker`
12. **Chunker** → Prepares chunks, creates `thread_summarization_queue` entry, updates stage to `summarizing`
13. **Webhook 6** → `thread_summarization_queue` INSERT triggers `sync-threads-summarizer`
14. **Summarizer** → Processes OpenAI summary, updates stage to `completed`
15. **Webhook 7** → `thread_processing_stages` UPDATE (to `completed`) triggers `sync-threads-completion-checker`
16. **Completion Checker** → Verifies all threads/pages done, marks `sync_job` as `completed`

---

## 🐛 Troubleshooting

### Webhook Not Triggering?
1. **Check webhook status**: Ensure it's "Active" in Dashboard
2. **Verify filter conditions**: Make sure the filter matches actual data
3. **Check Edge Function logs**: Look for incoming requests
4. **Verify service role key**: Ensure it's correct in webhook headers
5. **Check table data**: Ensure rows exist that match the filter conditions

### Functions Timing Out?
- Webhooks have a timeout limit
- Functions should process in batches and return quickly
- If processing takes too long, the function should process what it can and return

### Duplicate Processing?
- Webhooks can fire multiple times for the same event
- Functions should be idempotent (safe to run multiple times)
- Use status checks to prevent duplicate processing

### Jobs Stuck?
- Check `sync_page_queue` for pages stuck in `processing`
- Check `thread_processing_stages` for threads stuck in intermediate stages
- Manually trigger completion checker if needed

---

## 📝 Summary

✅ **7 Database Webhooks** configured for event-driven processing  
✅ **No CRON Jobs Required** - everything is triggered by database changes  
✅ **Automatic Retries** - Supabase handles webhook retries automatically  
✅ **Scalable** - Webhooks scale with database activity  

**All processing is now event-driven and automatic!** 🎉

