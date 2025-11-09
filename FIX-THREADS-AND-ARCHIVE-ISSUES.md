# Fix Threads and Archive Issues

## Issues Fixed

### Issue 1: Archived Companies Still Appearing in Main Table
**Problem**: Companies with 'archived' status were still showing up in the main customer threads table.

**Root Cause**: 
- The API query was using `.or()` with `.neq()` which doesn't properly handle NULL values in Supabase
- NULL status companies were being excluded when they shouldn't be

**Solution**:
- Updated `/api/customers/route.ts` to fetch all companies first, then filter in JavaScript
- This properly handles NULL status values and excludes only 'archived' companies
- Active companies include: NULL, 'active', 'inactive', 'at_risk', 'churned'
- Archived companies are filtered separately

### Issue 2: Still Seeing Emails Instead of Threads
**Problem**: The interaction timeline was still showing individual emails from the old `emails` table instead of threads from the new `threads` table.

**Root Cause**: 
- There are TWO migrations that create `get_company_page_details`:
  1. `20250125000010_create_company_page_details_function.sql` - OLD (uses emails)
  2. `03_correct_company_details_function.sql` - NEW (uses threads)
- The old migration runs AFTER the new one (alphabetically), overwriting the thread-based version

**Solution**:
- Created new migration `20250130000003_update_company_details_use_threads.sql`
- This migration runs AFTER the old one (timestamp 2025-01-30 vs 2025-01-25)
- Ensures the function uses threads as the PRIMARY source
- Legacy emails are still shown for backward compatibility, but only if they're NOT already in threads

## Files Changed

1. **src/app/api/customers/route.ts**
   - Changed to fetch all companies, then filter in JavaScript
   - Properly excludes archived companies while including NULL status

2. **supabase/migrations/20250130000003_update_company_details_use_threads.sql** (NEW)
   - Updates `get_company_page_details` function to use threads
   - Threads are PRIMARY source for interaction timeline
   - Legacy emails shown only if not already in threads

## Migration Instructions

1. **Run the new migration**:
   ```bash
   supabase migration up
   ```

2. **Verify the function is updated**:
   ```sql
   SELECT routine_definition 
   FROM information_schema.routines 
   WHERE routine_name = 'get_company_page_details';
   ```
   
   You should see queries using `threads` and `thread_company_link` tables.

3. **Test the changes**:
   - Archived companies should NOT appear in main table
   - Archived companies SHOULD appear in Archives section
   - Interaction timeline should show THREADS (not individual emails)
   - Each thread should show the full conversation summary

## How It Works Now

### Interaction Timeline
- **PRIMARY**: Shows threads from `threads` table joined with `thread_company_link`
- **FALLBACK**: Shows legacy emails from `emails` table (only if not in threads)
- **ALSO**: Shows meetings from `meetings` table

### Company Filtering
- **Active Companies**: All companies EXCEPT those with status = 'archived'
  - Includes: NULL, 'active', 'inactive', 'at_risk', 'churned'
- **Archived Companies**: Only companies with status = 'archived'

## Testing Checklist

- [ ] Run migration `20250130000003_update_company_details_use_threads.sql`
- [ ] Verify archived companies don't appear in main table
- [ ] Verify archived companies appear in Archives section
- [ ] Verify interaction timeline shows THREADS (not individual emails)
- [ ] Verify thread summaries are displayed correctly
- [ ] Verify legacy emails still work for backward compatibility
- [ ] Verify NULL status companies appear in main table

## Notes

- The migration timestamp ensures it runs AFTER the old function definition
- Threads are now the PRIMARY source for email interactions
- Legacy emails are kept for backward compatibility but are excluded if they're already in threads
- The function uses `thread_company_link` to properly filter threads by company

