# Fixes Applied - Thread Sync Webhook Issues

## Issues Fixed

### 1. **`next_retry_at` NULL Problem** ✅ FIXED
**Problem**: New page queue entries had `next_retry_at = NULL`, which caused the page worker query to exclude them (SQL `NULL <= anything` evaluates to NULL, not true/false).

**Root Cause**: 
- The orchestrator didn't set `next_retry_at` when creating new pages
- The page worker didn't set `next_retry_at` when enqueueing next pages
- The migration had no default value for `next_retry_at`

**Fix Applied**:
- ✅ Orchestrator now sets `next_retry_at = NOW()` when creating the initial page
- ✅ Page worker now sets `next_retry_at = NOW()` when enqueueing subsequent pages
- ✅ This ensures all new pages are immediately processable by webhooks

### 2. **Missing `total_pages` and `pages_completed` Updates** ✅ FIXED
**Problem**: The page worker wasn't updating `total_pages` and `pages_completed` in `sync_jobs`, causing the frontend to show `total_pages = null`.

**Fix Applied**:
- ✅ Page worker now updates `total_pages` after processing the first page (estimates 10 pages if there's a next page, 1 if it's the last)
- ✅ Page worker increments `pages_completed` after each page
- ✅ Page worker increases `total_pages` estimate if we exceed it and there are more pages

### 3. **CRON Jobs Still Active** ⚠️ NEEDS VERIFICATION
**Problem**: You mentioned seeing functions running every hour in the background, suggesting CRON jobs might still be active.

**Action Required**:
1. Run `check_and_remove_cron_jobs.sql` in Supabase SQL Editor to:
   - Check for active CRON jobs
   - View their run history
   - Remove them if they exist (uncomment the removal section)

**Note**: The `CRON_SETUP.md` file is outdated - we're using webhooks now, not CRON jobs.

## Files Modified

1. `supabase/functions/sync-threads-orchestrator/index.ts`
   - Added `next_retry_at: new Date().toISOString()` when creating initial page

2. `supabase/functions/sync-threads-page-worker/index.ts`
   - Updated comment to reflect webhook-driven architecture (not scheduled)
   - Added `next_retry_at: new Date().toISOString()` when enqueueing next pages
   - Added logic to update `total_pages` and `pages_completed` in `sync_jobs`

3. `check_and_remove_cron_jobs.sql` (NEW)
   - SQL script to check for and remove any active CRON jobs

## Next Steps

1. **Deploy the fixed functions**:
   ```bash
   supabase functions deploy sync-threads-orchestrator
   supabase functions deploy sync-threads-page-worker
   ```

2. **Check for CRON jobs**:
   - Run `check_and_remove_cron_jobs.sql` in Supabase SQL Editor
   - If any CRON jobs exist, uncomment the removal section and run it

3. **Test the sync**:
   - Trigger a new thread sync from the frontend
   - Verify that:
     - `total_pages` is set after the first page
     - `pages_completed` increments correctly
     - Webhooks trigger the page worker immediately

4. **Monitor logs**:
   - Check Edge Function logs to ensure webhooks are firing
   - Verify no CRON job invocations are happening

## Why This Happened

The design flaw was that `next_retry_at` was intended only for retry logic (when pages fail), but the query assumed it would always be set. For new pages, it was NULL, causing them to be excluded from processing.

The fix ensures that:
- New pages have `next_retry_at = NOW()` (immediately processable)
- Failed pages get `next_retry_at = future_time` (retry later)
- The query `.lte('next_retry_at', NOW())` works for both cases

