# Next Steps Implementation Summary

## ✅ What's Been Done

### 1. Database Function Updated
- **File**: `supabase/migrations/20251122000001_verify_next_steps_includes_both.sql`
- **Status**: ✅ Created and ready to apply
- **What it does**: 
  - Explicitly ensures next steps from BOTH `'thread'` and `'meeting'` source types are included
  - Added filter: `AND ns.source_type IN ('thread', 'meeting')` to make it explicit
  - The function already included both, but this makes it crystal clear

### 2. Frontend Already Supports Both
- **File**: `src/components/CompanyThreadPage.tsx`
- **Status**: ✅ Already configured
- **Interface**: `NextStep` includes `source_type: 'thread' | 'meeting'`
- **Display**: Next steps section shows all next steps regardless of source_type

### 3. Extraction System
- **Triggers**: Both thread and meeting triggers exist
  - `process_thread_next_steps_trigger` - extracts from threads
  - `process_meeting_next_steps_trigger` - extracts from meetings
- **Edge Function**: `process-next-steps` handles both types
- **Backfill Script**: `extract-meeting-next-steps-now.sql` available for existing data

## 📋 What Needs to Be Done

### Step 1: Apply the Migration ⚠️ **REQUIRED**

Run the migration in Supabase SQL Editor:

1. Go to: Supabase SQL Editor
2. Copy contents from: `supabase/migrations/20251122000001_verify_next_steps_includes_both.sql`
3. Paste and execute
4. Verify success: Should see "Success. No rows returned"

### Step 2: Extract Existing Next Steps (If Needed)

If you have existing meetings or threads with next_steps that haven't been extracted:

Run: `extract-meeting-next-steps-now.sql`

This will:
- Extract next steps from meetings that have them
- Extract next steps from threads that have them
- Insert them into the `next_steps` table
- Link them to the correct company
- Avoid duplicates

### Step 3: Verify Both Types Are Included

Run: `verify-next-steps-inclusion.sql`

This will check:
- How many next steps exist for each source type
- Whether both types are returned by the function
- If there are any that haven't been extracted yet

## 🔍 How It Works

### Next Steps Extraction

1. **From Threads**:
   - Trigger fires when `threads.llm_summary` is updated
   - Extracts from `llm_summary->>'csm_next_step'` or `llm_summary->'next_steps'`
   - Inserts into `next_steps` table with `source_type: 'thread'`

2. **From Meetings**:
   - Trigger fires when `meetings.next_steps` is updated
   - Extracts from `meetings.next_steps` JSONB column
   - Inserts into `next_steps` table with `source_type: 'meeting'`

### Next Steps Display

1. **Function Query**:
   ```sql
   SELECT ... FROM next_steps ns
   WHERE ns.company_id = company_id_param
     AND ns.source_type IN ('thread', 'meeting')
   ```
   - Returns both thread and meeting next steps
   - Sorted by completed status, then by creation date

2. **Frontend Display**:
   - Shows all next steps in "Next Steps" section
   - Groups by active/completed
   - Shows owner, due date, and completion status
   - Currently doesn't show source_type badge (could be added if needed)

## 🧪 Testing

After applying the migration:

1. **Test Next Steps from Threads**:
   - Create/update a thread with next steps in `llm_summary`
   - Verify it appears in Next Steps section
   - Check `source_type` is 'thread'

2. **Test Next Steps from Meetings**:
   - Create/update a meeting with `next_steps`
   - Verify it appears in Next Steps section
   - Check `source_type` is 'meeting'

3. **Test Both Together**:
   - Have both thread and meeting next steps for a company
   - Verify both appear in the Next Steps section
   - Verify they're sorted correctly (active first, then by date)

## 📝 Files Created/Modified

1. `supabase/migrations/20251122000001_verify_next_steps_includes_both.sql` - Main migration
2. `verify-next-steps-inclusion.sql` - Verification script
3. `extract-meeting-next-steps-now.sql` - Backfill script (already existed)
4. `NEXT-STEPS-IMPLEMENTATION-SUMMARY.md` - This file

## 🎯 Expected Results

After implementation:
- ✅ Next steps from threads appear in Next Steps section
- ✅ Next steps from meetings appear in Next Steps section
- ✅ Both types are included in the same list
- ✅ Both are sorted by completed status and date
- ✅ Both show owner, due date, and completion status

## 🔧 Troubleshooting

If next steps don't appear:

1. **Check if extracted**:
   ```sql
   SELECT source_type, COUNT(*) 
   FROM next_steps 
   WHERE company_id = 'YOUR_COMPANY_ID'
   GROUP BY source_type;
   ```

2. **Check triggers**:
   ```sql
   SELECT * FROM pg_trigger 
   WHERE tgname IN ('process_thread_next_steps_trigger', 'process_meeting_next_steps_trigger');
   ```

3. **Run backfill script**: `extract-meeting-next-steps-now.sql`

4. **Check function**:
   ```sql
   SELECT json_array_length(
     get_company_page_details('YOUR_COMPANY_ID'::uuid)->'next_steps'
   ) as next_steps_count;
   ```

