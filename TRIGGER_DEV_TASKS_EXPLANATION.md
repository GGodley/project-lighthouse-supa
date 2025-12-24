# Trigger.dev Tasks Flow Explanation

## Overview

Your Trigger.dev setup has **2 main tasks** that work together to sync and analyze Gmail threads:

1. **`ingest-threads`** - Fetches threads from Gmail and stores them
2. **`analyze-thread`** - Parses and analyzes individual threads

---

## Task 1: `ingest-threads` Task

**File**: `src/trigger/ingest-threads.ts`

### Purpose
Orchestrates the Gmail sync process by fetching threads in batches and triggering analysis.

### How It Works

1. **Acquires Lock** (lines 50-66)
   - Calls `claim_sync_lock` RPC to ensure only one sync runs per user
   - If lock is already held, exits gracefully

2. **Fetches Gmail Threads** (lines 73-274)
   - Calls Supabase Edge Function `fetch-gmail-batch` in a pagination loop
   - Each batch contains multiple threads from Gmail API
   - Handles pagination with `nextPageToken`

3. **Saves Threads to Database** (lines 219-239)
   - Upserts threads into `threads` table
   - **Critical**: Stores the entire Gmail thread object in `raw_thread_data` (JSONB column)
   - This includes all message data, headers, payloads, etc.

4. **Triggers Analysis** (lines 243-260)
   - Immediately triggers `analyze-thread` task for each thread in parallel
   - Uses `Promise.all` to dispatch all analysis jobs at once

5. **Releases Lock** (lines 278-290)
   - On completion or error, releases the sync lock
   - Updates `sync_jobs` table with status

### Key Data Flow
```
Gmail API → Edge Function → ingest-threads → threads table (with raw_thread_data) → analyze-thread
```

---

## Task 2: `analyze-thread` Task

**File**: `src/trigger/analyzer.ts`

### Purpose
Takes a thread from the database, parses its messages, extracts content, and performs AI analysis.

### How It Works (Step-by-Step)

#### Step 0: ETL (Extract, Transform, Load) - `runThreadEtl` function

**Location**: Lines 1010-1197

**What It Does**:
1. **Fetches Raw Thread Data** (lines 1020-1043)
   - Retrieves thread from `threads` table including `raw_thread_data`
   - Validates that `raw_thread_data` exists and is an object

2. **Extracts Messages** (lines 1045-1055)
   - Extracts `messages` array from `raw_thread_data.messages`
   - If no messages found, logs warning but continues

3. **Parses Each Message** (lines 1075-1138)
   - For each message in the array:
     - Extracts headers (from, to, cc)
     - Calls `collectBodies(payload)` to extract body text/HTML from nested Gmail payload structure
     - Converts HTML to text if needed using `htmlToText`
     - Extracts `internalDate` for sent_date
     - Builds `ThreadMessageUpsert` object

4. **Saves Messages** (lines 1177-1196)
   - **Bulk upserts** all parsed messages into `thread_messages` table
   - This is where messages should appear in your database
   - If `messagesToUpsert` is empty, logs warning but doesn't throw error

5. **Updates Thread Metadata** (lines 1159-1175)
   - Updates `threads` table with:
     - `subject` (from headers)
     - `snippet` (from Gmail)
     - `body` (flattened transcript of all messages)
     - `last_message_date`

#### Step 0.5: Participant Resolution

**Location**: Lines 1236-1303

**What It Does**:
- Extracts participant emails from `raw_thread_data`
- Creates/updates `companies` and `customers` records
- Links participants to thread via `thread_participants` table
- Propagates `last_interaction_at` to companies/customers

#### Step 1: Fetch Normalized Thread

**Location**: Lines 1305-1322

**What It Does**:
- Fetches thread again (now with updated `body` field from ETL step)
- Gets `last_analyzed_at` to determine analysis mode (full vs incremental)

#### Step 2: Fetch Messages for Analysis

**Location**: Lines 1343-1440

**What It Does**:
- **Fetches messages from `thread_messages` table** (not from `raw_thread_data`)
- For incremental mode: filters messages sent after `last_analyzed_at`
- For full mode: fetches all messages

#### Step 3: Construct Transcript

**Location**: Lines 1442-1519

**What It Does**:
- Builds a transcript string from messages
- Formats as: `"CustomerName (CompanyName): message_text"`
- **ERROR OCCURS HERE** (line 1515-1518):
  ```typescript
  if (!transcript || transcript.trim().length === 0) {
    throw new Error(
      `Analyzer: Thread ${threadId} has no content available for analysis`
    );
  }
  ```

#### Step 4-5: AI Analysis & Save Results

**Location**: Lines 1521-1936

**What It Does**:
- Calls OpenAI GPT-4 to analyze the transcript
- Extracts: problem statement, sentiment, next steps, feature requests
- Saves results to `threads.llm_summary`
- Inserts `next_steps` into database

---

## The Problem: Why You're Getting the Error

### Error Message
```
Error executing analyzer pipeline: Error: Analyzer: Thread 199d716527c5b8d6 has no content available for analysis
```

### Root Cause Analysis

The error occurs at **line 1517** in `analyzer.ts` when the transcript is empty. This happens because:

1. **Messages aren't being inserted into `thread_messages`** OR
2. **Messages are inserted but have no `body_text` or `body_html`**

### Possible Causes

#### Cause 1: `raw_thread_data` Structure Issue
- The Gmail thread object might not have a `messages` array
- Or `messages` array exists but is empty
- **Check**: Look at `raw_thread_data` in database for thread `199d716527c5b8d6`

#### Cause 2: Message Body Extraction Failure
- `collectBodies(payload)` function (lines 167-213) might not be extracting body content
- Gmail payload structure might be different than expected
- Messages might have body data in a nested location not being traversed

#### Cause 3: Messages Inserted Without Body Content
- Messages are being inserted but `body_text` and `body_html` are both `null`
- When constructing transcript (line 1499), it skips messages with no body:
  ```typescript
  const bodyText = msg.body_text || msg.body_html;
  if (!bodyText) continue; // Skips message if no body
  ```

### How to Debug

1. **Check `raw_thread_data` in database**:
   ```sql
   SELECT raw_thread_data->'messages' 
   FROM threads 
   WHERE thread_id = '199d716527c5b8d6';
   ```

2. **Check if messages were inserted**:
   ```sql
   SELECT COUNT(*), 
          COUNT(body_text) as has_text,
          COUNT(body_html) as has_html
   FROM thread_messages 
   WHERE thread_id = '199d716527c5b8d6';
   ```

3. **Check ETL logs**:
   - Look for: `"ETL: Found X messages in raw_thread_data"`
   - Look for: `"ETL: Upserted X messages"`
   - Look for: `"ETL: No messages to upsert"`

4. **Check message structure**:
   ```sql
   SELECT message_id, body_text, body_html, from_address
   FROM thread_messages 
   WHERE thread_id = '199d716527c5b8d6'
   LIMIT 5;
   ```

---

## Data Flow Diagram

```
┌─────────────────┐
│  Gmail API      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Edge Function   │
│ fetch-gmail-    │
│ batch           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ ingest-threads  │─────▶│  threads table    │
│                 │      │  (raw_thread_data)│
└────────┬────────┘      └──────────────────┘
         │
         │ triggers
         ▼
┌─────────────────┐
│ analyze-thread  │
│                 │
│ Step 0: ETL     │───▶ Parses raw_thread_data
│                 │     └─▶ thread_messages table
│                 │
│ Step 2: Fetch   │───▶ Reads from thread_messages
│                 │
│ Step 3: Build  │───▶ Constructs transcript
│   transcript   │     ⚠️ ERROR IF EMPTY
│                 │
│ Step 4: AI      │───▶ OpenAI analysis
│                 │
│ Step 5: Save    │───▶ Updates threads.llm_summary
└─────────────────┘
```

---

## Summary

**Your Flow**:
1. `ingest-threads` fetches threads and stores them with `raw_thread_data`
2. `analyze-thread` runs ETL to parse messages into `thread_messages`
3. `analyze-thread` reads from `thread_messages` to build transcript
4. If transcript is empty → error

**The Issue**:
- Messages aren't making it into `thread_messages` with body content
- This could be because:
  - `raw_thread_data.messages` is empty/missing
  - `collectBodies()` isn't extracting body content properly
  - Gmail payload structure is different than expected

**Next Steps**:
1. Check the database to see if `raw_thread_data` has messages
2. Check if messages were inserted into `thread_messages`
3. Check if inserted messages have `body_text` or `body_html`
4. Review ETL logs to see where the process is failing

---

## Diagnostic Queries

Run these SQL queries to diagnose the issue with thread `199d716527c5b8d6`:

### 1. Check if raw_thread_data has messages
```sql
SELECT 
  thread_id,
  jsonb_array_length(raw_thread_data->'messages') as message_count,
  raw_thread_data->'messages'->0 as first_message_sample
FROM threads 
WHERE thread_id = '199d716527c5b8d6';
```

### 2. Check message structure in raw_thread_data
```sql
SELECT 
  jsonb_pretty(raw_thread_data->'messages'->0->'payload') as first_message_payload
FROM threads 
WHERE thread_id = '199d716527c5b8d6';
```

### 3. Check if messages were inserted
```sql
SELECT 
  COUNT(*) as total_messages,
  COUNT(body_text) as messages_with_text,
  COUNT(body_html) as messages_with_html,
  COUNT(CASE WHEN body_text IS NULL AND body_html IS NULL THEN 1 END) as messages_without_body
FROM thread_messages 
WHERE thread_id = '199d716527c5b8d6';
```

### 4. Check specific message details
```sql
SELECT 
  message_id,
  from_address,
  CASE 
    WHEN body_text IS NOT NULL THEN 'Has text'
    WHEN body_html IS NOT NULL THEN 'Has HTML only'
    ELSE 'No body'
  END as body_status,
  LENGTH(body_text) as text_length,
  LENGTH(body_html) as html_length
FROM thread_messages 
WHERE thread_id = '199d716527c5b8d6'
ORDER BY sent_date
LIMIT 10;
```

### 5. Check thread body field (from ETL step)
```sql
SELECT 
  thread_id,
  subject,
  snippet,
  LENGTH(body) as body_length,
  last_message_date
FROM threads 
WHERE thread_id = '199d716527c5b8d6';
```

---

## Common Issues & Solutions

### Issue 1: `raw_thread_data.messages` is empty
**Symptom**: ETL logs show "No messages found in raw_thread_data"
**Cause**: Gmail API returned thread without messages array
**Solution**: Check the Edge Function `fetch-gmail-batch` to ensure it's requesting full message data

### Issue 2: Messages exist but have no body
**Symptom**: Messages inserted but `body_text` and `body_html` are both NULL
**Cause**: `collectBodies()` can't find body in payload structure
**Solution**: 
- Check Gmail API format - might need to request `format=full` or `format=raw`
- The payload structure might be different (multipart/alternative, etc.)
- Add logging to `collectBodies()` to see what it's receiving

### Issue 3: Body extraction fails silently
**Symptom**: Messages have body in `raw_thread_data` but not extracted
**Cause**: `decodeBase64Url()` fails or mimeType doesn't match
**Solution**: 
- Add error logging in `collectBodies()` function
- Check if base64 decoding is working
- Verify mimeType values in payload

### Issue 4: Messages not inserted due to constraint violation
**Symptom**: ETL logs show error about constraint violation
**Cause**: `message_id` might be missing or duplicate
**Solution**: Check if `msg.id` exists in raw data

