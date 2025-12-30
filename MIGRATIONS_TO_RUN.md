# Migrations to Run

## Required Migration

### 1. Add AI Insights Column to Companies Table
**File**: `supabase/migrations/20251231000000_add_ai_insights_to_companies.sql`

**Description**: Adds a JSONB column to store AI-generated company insights (one-liner, summary, tags, LinkedIn URL).

**SQL**:
```sql
-- Add ai_insights JSONB column to companies table
-- Stores structured AI-generated data: one_liner, summary, tags, linkedin_url
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ai_insights JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.companies.ai_insights IS 'Structured AI-generated insights: one_liner, summary, tags (array), linkedin_url';
```

**How to Run**:
1. Via Supabase Dashboard:
   - Go to Database → Migrations
   - Click "New Migration"
   - Copy and paste the SQL from the file above
   - Click "Run"

2. Via Supabase CLI:
   ```bash
   supabase db push
   ```

**Impact**: 
- Adds new column (safe, uses `IF NOT EXISTS`)
- No data loss
- No downtime required

