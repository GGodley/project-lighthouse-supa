# Meeting Timeline Fix - Deployment Guide

## Summary of Changes

This fix ensures that meeting summaries appear in the interaction timeline and displays them with the correct "Meeting" label instead of "Call".

### Files Modified:
1. ✅ `supabase/migrations/20251122000000_fix_meeting_timeline_query.sql` - **NEW MIGRATION** (needs to be applied)
2. ✅ `src/components/CompanyPage.tsx` - Updated labels from "Call" to "Meeting" (needs frontend deployment)

### What the Fix Does:
- Adds filters to only include meetings with summaries (`m.summary IS NOT NULL`)
- Adds filter to ensure meetings have start_time for proper sorting (`m.start_time IS NOT NULL`)
- Updates UI labels from "Call" to "Meeting" in both the interaction timeline and overview sections

---

## Deployment Steps

### Step 1: Apply Database Migration ⚠️ **REQUIRED**

The migration needs to be applied to your remote Supabase database.

#### Option A: Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new
2. Open the SQL Editor
3. Copy the entire contents of `supabase/migrations/20251122000000_fix_meeting_timeline_query.sql`
4. Paste into the SQL Editor
5. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)
6. Verify success: You should see "Success. No rows returned"

#### Option B: Supabase CLI (If Linked)

```bash
# Make sure you're linked to the remote project
supabase link --project-ref fdaqphksmlmupyrsatcz

# Push the migration
supabase db push
```

#### Verification Query

After applying the migration, verify the function was updated:

```sql
-- Check that the function exists and has the new filters
SELECT 
  proname,
  prosrc
FROM pg_proc 
WHERE proname = 'get_company_page_details';

-- You should see the WHERE clause includes:
-- AND m.summary IS NOT NULL
-- AND m.start_time IS NOT NULL
```

Or test with a real company:

```sql
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  interaction_type,
  interaction_date,
  title,
  summary
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'interaction_timeline'
) AS interaction
WHERE (interaction->>'interaction_type') = 'meeting'
ORDER BY (interaction->>'interaction_date') DESC;
```

---

### Step 2: Deploy Frontend Changes ⚠️ **REQUIRED**

The frontend changes in `CompanyPage.tsx` need to be deployed to your hosting platform.

#### If Using Vercel:
- Push changes to your Git repository
- Vercel will automatically deploy
- Or manually trigger deployment from Vercel dashboard

#### If Using Other Platform:
- Deploy using your standard deployment process
- Ensure `src/components/CompanyPage.tsx` is included in the build

#### Verification:
After deployment, check that:
- Meeting interactions show "Meeting" instead of "Call" in the interaction timeline
- Meeting interactions show "Meeting" instead of "Call" in the overview section

---

### Step 3: Edge Functions ✅ **NOT REQUIRED**

**No edge functions were modified.** The changes only affect:
- A SQL function (`get_company_page_details`) - handled by the migration
- Frontend React component - handled by frontend deployment

---

## Testing Checklist

After deployment, verify:

- [ ] Migration applied successfully (function updated in database)
- [ ] Meetings with summaries appear in interaction timeline
- [ ] Meetings display as "Meeting" (not "Call") in interaction timeline view
- [ ] Meetings display as "Meeting" (not "Call") in overview section
- [ ] Meetings appear in overview's 3 most recent interactions when applicable
- [ ] Meetings without summaries are excluded from timeline
- [ ] Threads still display correctly as "Email Thread"
- [ ] No console errors in browser

---

## Troubleshooting

### Meetings Still Not Appearing

1. **Check if meetings have summaries:**
   ```sql
   SELECT 
     google_event_id,
     title,
     summary,
     start_time,
     customer_id
   FROM meetings
   WHERE summary IS NOT NULL
     AND start_time IS NOT NULL
   LIMIT 10;
   ```

2. **Check if meetings are linked to customers:**
   ```sql
   SELECT 
     m.google_event_id,
     m.title,
     m.summary,
     c.customer_id,
     c.company_id
   FROM meetings m
   JOIN customers c ON m.customer_id = c.customer_id
   WHERE m.summary IS NOT NULL
     AND m.start_time IS NOT NULL
   LIMIT 10;
   ```

3. **Verify the function is using the new filters:**
   ```sql
   -- Check the function source code includes the filters
   SELECT prosrc 
   FROM pg_proc 
   WHERE proname = 'get_company_page_details'
   AND prosrc LIKE '%m.summary IS NOT NULL%';
   ```

### Labels Still Show "Call"

- Clear browser cache
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Verify the deployed frontend code includes the changes
- Check browser console for any JavaScript errors

---

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Restore the previous version of the function
-- (Copy from 20251119000000_add_company_id_to_product_feedback_response.sql)
-- Remove the two new WHERE conditions:
--   AND m.summary IS NOT NULL
--   AND m.start_time IS NOT NULL
```

For frontend rollback, revert the changes in `CompanyPage.tsx` and redeploy.

---

## Next Steps After Deployment

1. Monitor the interaction timeline to ensure meetings with summaries appear
2. Test with a real meeting that has a summary
3. Verify the overview section shows meetings correctly
4. Check that the 3 most recent interactions include meetings when applicable

