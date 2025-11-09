# Threads Sync Timestamp Implementation

## Overview
Added `threads_last_synced_at` column to the `profiles` table to track when threads were last synced for each user. This ensures accurate time-based incremental syncing across all timezones by using UTC consistently.

## Changes Made

### 1. Database Migration ✅
**File**: `supabase/migrations/20250130000000_add_threads_last_synced_at_to_profiles.sql`

- Added `threads_last_synced_at TIMESTAMPTZ` column to `profiles` table
- Column stores UTC timestamps
- Added index for faster queries
- Applied to database successfully

### 2. Sync Function Updates ✅
**File**: `supabase/functions/sync-threads/index.ts`

#### Reading Last Sync Time
- Now reads `threads_last_synced_at` from `profiles` table instead of querying threads
- Falls back to 90 days ago if no previous sync exists
- All time operations use UTC consistently

#### Updating Last Sync Time
- Updates `threads_last_synced_at` after successful sync completion
- Uses `new Date().toISOString()` which always returns UTC time
- Updates only when all pages are processed (no nextPageToken)

## Timezone Handling

### UTC Consistency
All timestamps are stored and processed in UTC:
- **Database**: `TIMESTAMPTZ` column stores UTC
- **JavaScript**: `new Date().toISOString()` returns UTC ISO string
- **Gmail API**: Unix timestamp (seconds since epoch) converted from UTC

### Time Conversion Flow
```
1. Read from DB: UTC timestamp (TIMESTAMPTZ)
2. Convert to Date: new Date(profileLastSyncedAt) - already UTC
3. Subtract 1 day: For boundary safety
4. Convert to Unix: Math.floor(date.getTime() / 1000)
5. Query Gmail: after:{unixTimestamp}
6. Save to DB: new Date().toISOString() - UTC ISO string
```

## Benefits

1. **Accurate Across Timezones**: Single UTC timezone eliminates timezone confusion
2. **Per-User Tracking**: Each user has their own sync timestamp
3. **Efficient Queries**: Direct timestamp lookup instead of scanning threads table
4. **Reliable Incremental Sync**: Always knows exactly when last sync occurred

## Usage

### First Sync
- `threads_last_synced_at` is `NULL`
- Function queries last 90 days
- After completion, sets timestamp to current UTC time

### Subsequent Syncs
- Reads `threads_last_synced_at` from profiles
- Queries Gmail for threads modified after that time
- Updates timestamp after successful completion

## Example Timeline

```
User in New York (EST, UTC-5):
- Last sync: 2024-01-15 10:00:00 UTC
- Next sync: 2024-01-20 14:00:00 UTC
- Function queries: after:1705320000 (2024-01-14 10:00:00 UTC - 1 day)
- Updates timestamp: 2024-01-20 14:00:00 UTC

User in Tokyo (JST, UTC+9):
- Last sync: 2024-01-15 10:00:00 UTC
- Next sync: 2024-01-20 14:00:00 UTC
- Function queries: after:1705320000 (same Unix timestamp)
- Updates timestamp: 2024-01-20 14:00:00 UTC

Both users use the same UTC timestamp, ensuring consistency.
```

## Code Changes Summary

### Migration
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS threads_last_synced_at TIMESTAMPTZ;
```

### Function - Reading Timestamp
```typescript
const { data: profileData } = await supabaseAdmin
  .from('profiles')
  .select('email, threads_last_synced_at')
  .eq('id', userId)
  .single();

const profileLastSyncedAt = profileData.threads_last_synced_at;

if (profileLastSyncedAt) {
  lastSyncTime = new Date(profileLastSyncedAt);
  // Subtract 1 day for boundary safety
  lastSyncTime = new Date(lastSyncTime.getTime() - (24 * 60 * 60 * 1000));
} else {
  // Default to 90 days ago in UTC
  lastSyncTime = new Date();
  lastSyncTime.setUTCDate(lastSyncTime.getUTCDate() - 90);
}
```

### Function - Updating Timestamp
```typescript
// After successful sync completion
const currentUTCTime = new Date().toISOString(); // Always UTC
await supabaseAdmin
  .from('profiles')
  .update({ threads_last_synced_at: currentUTCTime })
  .eq('id', userId);
```

## Deployment Status

✅ **Migration Applied**: `20250130000000_add_threads_last_synced_at_to_profiles.sql`
✅ **Function Deployed**: `sync-threads` edge function updated
✅ **Database Updated**: Column added to `profiles` table

## Testing

To verify the implementation:

1. **Check column exists**:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'threads_last_synced_at';
```

2. **Check first sync**:
- Run sync for a user with NULL timestamp
- Verify it queries 90 days back
- Check timestamp is set after completion

3. **Check subsequent syncs**:
- Run sync again
- Verify it uses the stored timestamp
- Check timestamp is updated

4. **Check timezone consistency**:
- Verify all timestamps are in UTC format
- Check Gmail queries use correct Unix timestamps

## Notes

- The timestamp is only updated on successful completion (no nextPageToken)
- If timestamp update fails, it's logged but doesn't fail the job
- The 1-day subtraction ensures boundary threads are caught
- All operations use UTC to avoid timezone issues

