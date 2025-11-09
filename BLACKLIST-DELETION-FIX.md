# Blacklist & Company Deletion Fix

## Issues Fixed

### Issue 1: Deleted Companies Still Appearing in Customer Threads Table
**Problem**: When a company was deleted, related data wasn't being properly removed, causing deleted companies to still appear in the customer threads table.

**Root Cause**: 
- The `customers` table's foreign key to `companies` didn't have `ON DELETE CASCADE`, so customers weren't being deleted when their company was deleted
- The deletion process didn't wait for cascade operations to complete before refreshing the UI

**Solution**:
1. Created migration `20250130000001_fix_company_deletion_cascade.sql` to ensure `customers.company_id` foreign key uses `ON DELETE CASCADE`
2. Updated deletion handler in `customer-threads/page.tsx` to wait 500ms after deletion before refreshing to allow cascade operations to complete
3. Added cache-busting headers to the refresh request

**What Gets Deleted When a Company is Deleted**:
- ✅ `thread_company_link` entries (already had CASCADE)
- ✅ `customers` with matching `company_id` (now has CASCADE)
- ✅ `thread_messages.customer_id` set to NULL (already had SET NULL)

### Issue 2: Mail Still Appearing in Interaction Timeline After Deletion
**Problem**: The interaction timeline was still showing emails from deleted companies, even though the summary was deleted.

**Root Cause**: 
- The `get_company_page_details` function was querying from the old `emails` table instead of the new `threads`/`thread_messages` tables
- When a company was deleted, `thread_company_link` entries were removed, but the function wasn't using this relationship

**Solution**:
1. Updated `03_correct_company_details_function.sql` to:
   - Query from `threads` table joined with `thread_company_link` for the new thread-based system
   - Use `llm_summary` from threads table for summaries
   - Keep legacy `emails` table queries for backward compatibility (but exclude emails already in threads)
   - Updated `all_next_steps` to include next steps from threads (`csm_next_step` from `llm_summary`)

**How It Works Now**:
- Interaction timeline queries threads via `thread_company_link` to filter by company
- When a company is deleted, `thread_company_link` entries are removed (CASCADE)
- Deleted companies' threads no longer appear in the interaction timeline
- Legacy emails are still shown for backward compatibility, but excluded if they're already in threads

## Files Changed

1. **supabase/migrations/20250130000001_fix_company_deletion_cascade.sql** (NEW)
   - Ensures customers are deleted when their company is deleted

2. **supabase/migrations/03_correct_company_details_function.sql** (UPDATED)
   - Updated interaction timeline to use threads instead of emails
   - Updated all_next_steps to include thread-based next steps

3. **src/app/dashboard/customer-threads/page.tsx** (UPDATED)
   - Added delay after deletion to allow cascade operations
   - Added cache-busting headers to refresh request
   - Added comments explaining cascade behavior

## Testing Checklist

- [ ] Delete a company and verify it disappears from the customer threads table
- [ ] Verify that customers associated with the deleted company are also deleted
- [ ] Verify that thread_company_link entries for the deleted company are removed
- [ ] Verify that thread_messages for deleted company customers have customer_id set to NULL
- [ ] Verify that the interaction timeline no longer shows threads from deleted companies
- [ ] Verify that summaries from deleted companies' threads are no longer visible
- [ ] Verify that the domain is added to the blocklist when a company is deleted
- [ ] Verify that new threads from blocked domains are not imported during sync

## Migration Instructions

1. Run the migration:
   ```bash
   supabase migration up
   ```

2. The migration will:
   - Check if `customers` table has `company_id` column
   - Update the foreign key constraint to use `ON DELETE CASCADE`
   - This ensures customers are deleted when their company is deleted

3. Update the `get_company_page_details` function:
   - The function has been updated in `03_correct_company_details_function.sql`
   - Run this migration if it hasn't been applied yet

## Notes

- The blacklist functionality in `sync-threads/index.ts` already correctly filters out blocked domains during sync
- The interaction timeline now properly filters by company via `thread_company_link`
- Legacy emails are still supported for backward compatibility
- Threads themselves are NOT deleted when a company is deleted (they may be linked to multiple companies)

