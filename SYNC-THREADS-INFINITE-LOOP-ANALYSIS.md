# Sync-Threads Infinite Loop Analysis

## Problem Summary
The `sync-threads` edge function is causing an infinite loop, continuously making requests to OpenAI and Google without adding new data to the database.

## Root Causes Identified

### 1. **Missing Duplicate Thread Check** (CRITICAL)
**Location**: Lines 472-651 (thread processing loop)

**Issue**: The function processes ALL threads returned by Gmail API without first checking if they already exist in the database. This means:
- It calls OpenAI for summarization even when threads are already processed
- It makes unnecessary Google API calls to fetch thread details
- It processes the same threads repeatedly on each run

**Impact**: High - This is the primary cause of wasted API calls and potential infinite loops.

### 2. **Unhandled Recursive Invocation Errors** (CRITICAL)
**Location**: Lines 707-715

**Issue**: The recursive self-invocation on line 709 uses `await` but doesn't handle errors:
```typescript
await supabaseAdmin.functions.invoke('sync-threads', {
  body: {
    jobId: jobId,
    provider_token,
    pageToken: listJson.nextPageToken
  }
});
```

**Problems**:
- If the invocation fails (timeout, network error, etc.), the error is not caught
- The function returns 202 (Accepted) immediately, so the caller doesn't know if the next page was processed
- Failed invocations might cause the same pageToken to be processed again
- No retry logic or fallback mechanism

**Impact**: High - This can cause the function to retry the same pageToken indefinitely.

### 3. **No Safeguard Against Processing Same PageToken**
**Location**: Lines 453-462 (Gmail API call)

**Issue**: There's no mechanism to track which pageTokens have already been processed. If the recursive call fails silently, the same pageToken might be processed multiple times.

**Impact**: Medium - Can cause duplicate processing and infinite loops.

### 4. **Database Upsert May Fail Silently**
**Location**: Lines 661-698 (batch insert logic)

**Issue**: While errors are caught and thrown, if the upsert partially succeeds (some threads saved, some not), the function continues to the next page. This can lead to:
- Inconsistent state
- Repeated processing of the same threads
- API calls for data that's already partially saved

**Impact**: Medium - Can cause data inconsistency and repeated processing.

### 5. **No Early Exit for Empty Results**
**Location**: Line 468

**Issue**: If `threadIds.length === 0`, the function still checks for `nextPageToken` and might continue processing. However, if Gmail keeps returning empty results with a nextPageToken, it could loop indefinitely.

**Impact**: Low - Less likely but possible edge case.

## Successful Exit Conditions

The function should exit successfully when:

1. **No nextPageToken** (Line 716-718)
   - Gmail API returns no `nextPageToken` in the response
   - Job status is updated to 'completed'
   - Function returns 202 response

2. **All threads processed and saved**
   - Threads are fetched from Gmail
   - Only NEW threads (not in database) are processed
   - Data is successfully saved to database
   - No nextPageToken is returned

3. **Error occurs and job is marked as failed** (Line 738)
   - Any error in the try-catch block
   - Job status is updated to 'failed'
   - Function returns 500 response

4. **No threads to process**
   - Gmail API returns empty thread list
   - No nextPageToken
   - Job is marked as completed

## Recommended Fixes

### Fix 1: Add Duplicate Thread Check
Before processing each thread, check if it already exists in the database:
```typescript
// Check if thread already exists
const { data: existingThread } = await supabaseAdmin
  .from('threads')
  .select('thread_id')
  .eq('thread_id', threadId)
  .eq('user_id', userId)
  .single();

if (existingThread) {
  console.log(`⏭️ Thread ${threadId} already exists. Skipping.`);
  continue;
}
```

### Fix 2: Add Error Handling for Recursive Invocation
Wrap the recursive call in try-catch and handle failures:
```typescript
if (listJson.nextPageToken) {
  try {
    const { data, error } = await supabaseAdmin.functions.invoke('sync-threads', {
      body: {
        jobId: jobId,
        provider_token,
        pageToken: listJson.nextPageToken
      }
    });
    
    if (error) {
      console.error('Failed to invoke next page:', error);
      await updateJobStatus(jobId, 'failed', `Failed to process next page: ${error.message}`);
      throw error;
    }
  } catch (invokeError) {
    console.error('Error invoking next page:', invokeError);
    await updateJobStatus(jobId, 'failed', `Error processing next page: ${invokeError.message}`);
    throw invokeError;
  }
}
```

### Fix 3: Add PageToken Tracking (Optional but Recommended)
Track processed pageTokens to prevent duplicate processing:
```typescript
// Store processed pageTokens in job details or a separate table
// Check before processing if this pageToken was already processed
```

### Fix 4: Batch Check for Existing Threads
Instead of checking one-by-one, fetch all existing thread IDs in one query:
```typescript
// Before the loop, fetch all existing thread IDs for this user
const { data: existingThreads } = await supabaseAdmin
  .from('threads')
  .select('thread_id')
  .eq('user_id', userId)
  .in('thread_id', threadIds);

const existingThreadIds = new Set(existingThreads?.map(t => t.thread_id) || []);

// Then in the loop:
if (existingThreadIds.has(threadId)) {
  console.log(`⏭️ Thread ${threadId} already exists. Skipping.`);
  continue;
}
```

### Fix 5: Add Early Exit for Empty Results
If no threads are returned and no nextPageToken, exit early:
```typescript
if (threadIds.length === 0 && !listJson.nextPageToken) {
  await updateJobStatus(jobId, 'completed', 'No threads found to sync.');
  return new Response(JSON.stringify({ message: "No threads to process." }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200
  });
}
```

## Priority Order
1. **Fix 1** (Duplicate check) - CRITICAL - Prevents unnecessary API calls
2. **Fix 2** (Error handling) - CRITICAL - Prevents infinite loops from failed invocations
3. **Fix 4** (Batch check) - HIGH - Optimizes the duplicate check
4. **Fix 5** (Early exit) - MEDIUM - Prevents unnecessary processing
5. **Fix 3** (PageToken tracking) - LOW - Nice to have but not critical

