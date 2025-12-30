# Deployment Instructions

## 1. Database Migration

### Required Migration: Add AI Insights Column

**File**: `supabase/migrations/20251231000000_add_ai_insights_to_companies.sql`

### Option A: Via Supabase CLI (Recommended)

```bash
# Push all pending migrations (including the new one)
supabase db push --include-all
```

**Note**: The CLI detected that there are local migrations that need to be applied. Using `--include-all` will apply all pending migrations in order.

### Option B: Via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Migrations**
3. Click **New Migration**
4. Copy and paste the following SQL:

```sql
-- Add ai_insights JSONB column to companies table
-- Stores structured AI-generated data: one_liner, summary, tags, linkedin_url
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ai_insights JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.companies.ai_insights IS 'Structured AI-generated insights: one_liner, summary, tags (array), linkedin_url';
```

5. Click **Run**

### Migration Details

- **Safe**: Uses `IF NOT EXISTS` - won't fail if column already exists
- **No Downtime**: Adding a nullable column is a safe operation
- **No Data Loss**: Existing data is unaffected

---

## 2. Edge Functions Deployment

### Status

Edge functions have been deployed. The following functions were updated:

- ✅ `sync-threads` - Updated with AI insights trigger
- ✅ `sync-emails` - Updated with AI insights trigger  
- ✅ `company-customer-resolver` (shared) - Updated with AI insights trigger
- ✅ All other edge functions deployed

### Verify Deployment

You can verify the deployment by checking:

```bash
supabase functions list
```

Or in the Supabase Dashboard:
1. Go to **Edge Functions** section
2. Verify all functions are listed and active

---

## 3. Environment Variables Required

Make sure these environment variables are set in your Supabase project:

### Required for AI Insights Generation

- `GEMINI_API_KEY` - Your Google Gemini API key
- `TRIGGER_API_KEY` - Your Trigger.dev API key (for background task processing)

### Set in Supabase Dashboard

1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add or verify these secrets:
   - `GEMINI_API_KEY`
   - `TRIGGER_API_KEY`

---

## 4. Post-Deployment Verification

### Test AI Insights Generation

1. Create a new company (or use an existing one)
2. Check the `companies.ai_insights` column - it should be populated automatically
3. Or manually trigger via the "Generate Profile" button in the Company Sidebar

### Check Trigger.dev Task

1. Go to your Trigger.dev dashboard
2. Look for the `generate-company-insights` task
3. Verify it's registered and can be triggered

---

## Summary

✅ **Edge Functions**: Deployed  
⏳ **Migration**: Needs to be run (see instructions above)  
✅ **Code**: All changes pushed to git

**Next Step**: Run the migration using one of the methods above.

