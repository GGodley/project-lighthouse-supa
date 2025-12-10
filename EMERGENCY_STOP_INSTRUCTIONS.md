# 🚨 Emergency Stop Instructions - Database Timeout Issue

The database is timing out on UPDATE queries, likely due to:
- Heavy CPU load
- Table locks from active processing
- Too many concurrent operations

## ✅ IMMEDIATE ACTION: Disable Webhooks First

**This is the fastest way to stop new work:**

1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
2. **Disable ALL thread sync webhooks** (toggle to "Inactive"):
   - `trigger-page-worker`
   - `trigger-thread-processor`
   - `trigger-thread-importer`
   - `trigger-thread-preprocessor`
   - `trigger-thread-cleaner`
   - `trigger-thread-chunker`
   - `trigger-thread-summarizer`
   - `trigger-completion-checker`

**This will immediately stop new work from starting.**

---

## 🔄 Then: Stop Existing Jobs

After webhooks are disabled, try one of these approaches:

### Option 1: Use Retry Delay (Non-Blocking)

Run `stop_all_thread_processing_via_retry.sql`:
- Sets `next_retry_at` far in the future
- Doesn't update status fields (avoids triggers/locks)
- Functions will skip these jobs automatically

### Option 2: Wait for Natural Completion

- Current function invocations will finish (usually 1-5 minutes)
- No new work will start (webhooks disabled)
- CPU will drop naturally as functions complete

### Option 3: Restart Supabase Project (Last Resort)

If CPU is still maxed out after 10-15 minutes:
1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/settings/infrastructure
2. Click "Restart" (this will kill all active connections)
3. Wait 2-3 minutes for restart
4. Then run the stop SQL queries

---

## 📊 Monitor Progress

After disabling webhooks:
1. Check CPU usage in dashboard
2. Should see drop within 1-2 minutes (no new work)
3. Should see further drop within 5-10 minutes (existing work completes)

---

## 🔄 Resume Later

When ready to resume:
1. Re-enable webhooks
2. If you used retry delay approach, reset `next_retry_at`:
   ```sql
   UPDATE sync_page_queue SET next_retry_at = NULL WHERE next_retry_at > NOW() + INTERVAL '1 day';
   UPDATE thread_processing_stages SET next_retry_at = NULL WHERE next_retry_at > NOW() + INTERVAL '1 day';
   ```
3. Or restart failed jobs manually

---

## ⚠️ Why This Happens

The timeout occurs because:
- Too many rows being updated at once
- Table locks from active processing
- Database connection pool exhaustion
- CPU at 100% can't process queries fast enough

**Disabling webhooks is the fastest solution** - it stops the cascade immediately without needing database updates.

