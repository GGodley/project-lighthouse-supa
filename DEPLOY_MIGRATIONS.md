# Deploy Thread Sync Migrations

## Quick Deploy Instructions

Since the Supabase CLI is having migration state conflicts, apply the migrations directly via the Dashboard SQL Editor.

### Step 1: Open Supabase Dashboard SQL Editor

1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new
2. Make sure you're in the **"My Project"** project (ref: `fdaqphksmlmupyrsatcz`)

### Step 2: Apply the Combined Migration

1. Open the file: `combined_new_migrations.sql` in this directory
2. Copy **ALL** the contents
3. Paste into the Supabase Dashboard SQL Editor
4. Click **"Run"** (or press `Cmd+Enter` / `Ctrl+Enter`)
5. Wait for execution to complete

### Step 3: Verify Tables Were Created

Run this verification query in the SQL Editor:

```sql
-- Verify all three tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
   AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN (
    'thread_processing_stages',
    'sync_page_queue', 
    'thread_summarization_queue'
  )
ORDER BY table_name;
```

**Expected Result**: You should see all 3 tables with their column counts.

### Step 4: Verify Indexes and Triggers

```sql
-- Check indexes
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'thread_processing_stages',
    'sync_page_queue',
    'thread_summarization_queue'
  )
ORDER BY tablename, indexname;

-- Check triggers
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgrelid::regclass::text IN (
  'thread_processing_stages',
  'sync_page_queue',
  'thread_summarization_queue'
)
AND tgisinternal = false;
```

### Step 5: Mark Migrations as Applied (Optional)

After successfully applying the migrations, mark them in the migration table:

```sql
-- Mark migrations as applied
INSERT INTO supabase_migrations.schema_migrations(version, name) 
VALUES 
  ('20251208222530', 'create_thread_processing_stages'),
  ('20251208222531', 'create_sync_page_queue'),
  ('20251208222532', 'create_thread_summarization_queue')
ON CONFLICT (version) DO NOTHING;
```

---

## Alternative: Use Supabase CLI (If Migration State is Fixed)

If you fix the migration state conflicts, you can use:

```bash
supabase db push --include-all
```

But this requires resolving the duplicate migration entries first.

---

## What Gets Created

### 1. `thread_processing_stages` Table
- Tracks threads through 5 processing stages
- Includes error tracking, retry logic, and stage flags
- Has indexes for efficient querying

### 2. `sync_page_queue` Table  
- Manages Gmail API pagination
- Includes retry logic and idempotency keys
- Prevents stuck jobs

### 3. `thread_summarization_queue` Table
- Async queue for OpenAI summarization
- Separates summarization from import
- Includes retry logic

All tables include:
- Row Level Security (RLS) policies
- Proper indexes for performance
- Foreign key constraints
- Timestamps and metadata

---

## Troubleshooting

### Error: "relation already exists"
- The table already exists - this is safe to ignore
- The migration uses `CREATE TABLE IF NOT EXISTS`

### Error: "duplicate key value violates unique constraint"
- The migration record already exists
- This is safe to ignore - the table was already created

### Error: "permission denied"
- Make sure you're using the service role key or have proper permissions
- Check that you're in the correct project

---

## Next Steps

After migrations are applied:
1. ✅ Deploy edge functions (see edge function deployment guide)
2. ✅ Set up database webhooks (see webhook setup guide)
3. ✅ Test the sync flow

