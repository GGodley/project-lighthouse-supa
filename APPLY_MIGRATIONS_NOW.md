# 🚀 Apply Thread Sync Migrations - Quick Guide

## ⚡ Fastest Method: Supabase Dashboard SQL Editor

The Supabase CLI has migration state conflicts, so apply directly via Dashboard:

### Step 1: Open SQL Editor
**URL**: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new

### Step 2: Copy & Paste Migration
1. Open file: `combined_new_migrations.sql` (in project root)
2. **Select ALL** (Cmd+A / Ctrl+A)
3. **Copy** (Cmd+C / Ctrl+C)
4. **Paste** into SQL Editor
5. Click **"Run"** button (or Cmd+Enter / Ctrl+Enter)

### Step 3: Verify Success
You should see: **"Success. No rows returned"** or similar success message.

### Step 4: Verify Tables Created
Run this in SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'thread_processing_stages',
    'sync_page_queue',
    'thread_summarization_queue'
  );
```

**Expected**: 3 rows returned

---

## 📁 Migration File Location

**File**: `/Users/gabrielgodley/Desktop/Work/Projects/Project_lighthouse_supa/combined_new_migrations.sql`

**Size**: 219 lines

**Contains**: All 3 new tables with indexes, triggers, RLS policies, and migration tracking

---

## ✅ What Gets Created

1. ✅ `thread_processing_stages` - Tracks threads through 5 processing stages
2. ✅ `sync_page_queue` - Manages Gmail API pagination  
3. ✅ `thread_summarization_queue` - Async OpenAI summarization queue

All with proper indexes, RLS policies, and error handling!

---

## 🔄 After Migration

Once migrations are applied:
1. Deploy edge functions (next step)
2. Set up database webhooks (see webhook guide)
3. Test the sync flow

