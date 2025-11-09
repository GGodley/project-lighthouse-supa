# Deploy Sync-Threads Fix to Supabase

## Summary of Changes

The `sync-threads` edge function has been fixed to:
1. ✅ Stop infinite loops with proper error handling
2. ✅ Track last sync time and query Gmail incrementally
3. ✅ Update existing threads that have new messages
4. ✅ Skip threads that haven't changed
5. ✅ Only process new messages for existing threads

## Deployment Steps

### 1. Deploy the Edge Function

```bash
# Navigate to project root
cd /Users/gabrielgodley/Desktop/Work/Projects/Project_lighthouse_supa

# Deploy the sync-threads function
supabase functions deploy sync-threads
```

### 2. Verify Deployment

After deployment, verify the function is active:
```bash
supabase functions list
```

You should see `sync-threads` in the list with status `ACTIVE`.

### 3. Test the Function

The function will now:
- Query Gmail for threads modified after the last sync time
- Only process threads that are new or have new messages
- Skip threads that haven't changed
- Update existing threads with new messages
- Properly handle errors and exit conditions

## Key Improvements

### Time-Based Incremental Sync
- **Before**: Always queried last 90 days, processed all threads
- **After**: Queries from last sync time, only processes changed threads

### Smart Thread Updates
- **Before**: Skipped all existing threads
- **After**: Checks if thread has new messages, updates if needed

### Message Optimization
- **Before**: Processed all messages for all threads
- **After**: Only processes new messages for existing threads

### Error Handling
- **Before**: Recursive calls could fail silently, causing infinite loops
- **After**: Proper error handling with job status updates

## Expected Behavior

1. **First Run**: 
   - Queries last 90 days (no previous sync)
   - Processes all threads
   - Saves to database

2. **Subsequent Runs**:
   - Queries from last sync time
   - Only processes threads modified after that time
   - Updates threads with new messages
   - Skips unchanged threads

3. **Thread with New Email**:
   - Detects thread exists
   - Checks if last_message_date is newer
   - If newer: fetches thread, adds new messages, updates summary
   - If same: skips processing

## Monitoring

Check the function logs to verify behavior:
```bash
supabase functions logs sync-threads --tail
```

Look for these log messages:
- `📅 Last sync time: ...` - Shows what date range is being queried
- `📊 Found X existing threads out of Y total` - Shows duplicate detection
- `🔄 Thread ... exists but has new messages. Updating...` - Shows thread updates
- `⏭️ Thread ... exists and has no new messages. Skipping.` - Shows skipped threads
- `✨ Thread ... is new. Processing...` - Shows new threads

## Rollback (if needed)

If you need to rollback:
```bash
# List function versions
supabase functions list --version

# Deploy previous version (if available)
supabase functions deploy sync-threads --version <previous-version>
```

## Notes

- The function now uses `last_message_date` from the most recent thread to determine sync time
- Falls back to 90 days ago if no previous sync exists
- Subtracts 1 day from last sync time to ensure boundary threads are caught
- Uses upsert operations, so it's safe to run multiple times

