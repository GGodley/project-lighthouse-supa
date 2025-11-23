# Meeting Summaries and Next Steps Implementation - Complete

## ✅ What's Been Done

### 1. Database Migration Created
- **File**: `supabase/migrations/20251122000000_fix_meeting_timeline_query.sql`
- **Status**: ✅ Created and ready to apply
- **What it does**: Adds filters to only include meetings with summaries (`m.summary IS NOT NULL`) and start_time (`m.start_time IS NOT NULL`) in the interaction timeline

### 2. Frontend Labels Updated
- **File**: `src/components/CompanyPage.tsx`
- **Status**: ✅ Already updated
- **Changes**:
  - Line 642: Changed 'Call' to 'Meeting' in interaction timeline
  - Line 365: Changed 'Call' to 'Meeting' in overview section

### 3. SQL Query Verified
- **Status**: ✅ Working correctly
- **Test Result**: The function `get_company_page_details` correctly returns meetings with summaries (verified via SQL test)

## 📋 What Needs to Be Done

### Step 1: Apply the Migration ⚠️ **REQUIRED**

Run the migration in Supabase SQL Editor:

1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new
2. Copy contents from: `supabase/migrations/20251122000000_fix_meeting_timeline_query.sql`
3. Paste and execute
4. Verify success: Should see "Success. No rows returned"

### Step 2: Verify Implementation

Run the verification script: `verify-meeting-implementation.sql`

This will check:
- ✅ Migration has been applied
- ✅ Next steps triggers exist and are enabled
- ✅ Next steps functions exist
- ✅ Meetings with summaries are ready

### Step 3: Extract Existing Next Steps (If Needed)

If you have existing meetings with next_steps that haven't been extracted:

Run: `extract-meeting-next-steps-now.sql`

This will:
- Extract next steps from meetings that have them
- Insert them into the `next_steps` table
- Link them to the correct company via customer_id → company_id
- Avoid duplicates

## 🔍 How It Works

### Meeting Summaries in Interaction Timeline

1. **Data Flow**:
   - Meetings table → `customer_id` → Customers table → `company_id` → Companies table
   - Function filters: `m.summary IS NOT NULL` AND `m.start_time IS NOT NULL`
   - Returns meetings in `interaction_timeline` array with `interaction_type: 'meeting'`

2. **Frontend Display**:
   - CompanyPage.tsx displays meetings with "Meeting" label
   - Shows summary, title, date, and sentiment
   - Appears in both Overview (3 most recent) and Interaction Timeline view

### Next Steps from Meetings

1. **Automatic Extraction**:
   - Trigger `process_meeting_next_steps_trigger` fires when `meetings.next_steps` is updated
   - Calls `process-next-steps` edge function
   - Extracts next steps from `meetings.next_steps` JSONB column
   - Inserts into `next_steps` table with `source_type: 'meeting'`

2. **Display**:
   - `get_company_page_details` function queries `next_steps` table
   - Filters by `company_id` and `source_type: 'meeting'`
   - Returns in `next_steps` array
   - Frontend displays in Next Steps section

## 🧪 Testing

After applying the migration:

1. **Test Meeting Summaries**:
   - Go to a company page that has meetings with summaries
   - Check Interaction Timeline tab
   - Verify meetings appear with "Meeting" label
   - Verify summary text is displayed

2. **Test Next Steps**:
   - Check if meetings with `next_steps` have them extracted
   - Verify they appear in Next Steps section
   - Verify they're linked to the correct company

3. **Test Overview**:
   - Check if meetings appear in the 3 most recent interactions
   - Verify they show as "Meeting" not "Call"

## 📝 Files Created

1. `supabase/migrations/20251122000000_fix_meeting_timeline_query.sql` - Main migration
2. `verify-meeting-implementation.sql` - Verification script
3. `extract-meeting-next-steps-now.sql` - Backfill script for next steps
4. `verify-meeting-for-customer.sql` - Diagnostic queries
5. `MEETING-IMPLEMENTATION-COMPLETE.md` - This file

## 🎯 Expected Results

After implementation:
- ✅ Meeting summaries appear in interaction timeline
- ✅ Meetings labeled as "Meeting" (not "Call")
- ✅ Next steps from meetings appear in Next Steps section
- ✅ Both threads and meetings show correctly
- ✅ Overview shows meetings in 3 most recent interactions

## 🔧 Troubleshooting

If meetings don't appear:

1. **Check migration applied**:
   ```sql
   SELECT prosrc FROM pg_proc 
   WHERE proname = 'get_company_page_details'
   AND prosrc LIKE '%m.summary IS NOT NULL%';
   ```

2. **Check meeting data**:
   ```sql
   SELECT google_event_id, title, summary, start_time, customer_id
   FROM meetings
   WHERE summary IS NOT NULL AND summary != '';
   ```

3. **Check customer-company link**:
   ```sql
   SELECT m.google_event_id, c.customer_id, c.company_id
   FROM meetings m
   JOIN customers c ON m.customer_id = c.customer_id
   WHERE m.summary IS NOT NULL;
   ```

If next steps don't appear:

1. **Check if extracted**:
   ```sql
   SELECT * FROM next_steps 
   WHERE source_type = 'meeting';
   ```

2. **Run backfill script**: `extract-meeting-next-steps-now.sql`

3. **Check trigger**:
   ```sql
   SELECT * FROM pg_trigger 
   WHERE tgname = 'process_meeting_next_steps_trigger';
   ```

