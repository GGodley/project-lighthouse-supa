# ⚡ Quick Start: Unified Orchestrator Migration

## 🎯 What This Fixes

**Problem**: Webhook cascade explosion
- 10 threads → 1,250+ webhook calls
- CPU throttling
- Connection pool exhaustion

**Solution**: Unified orchestrator
- 10 threads → 10 webhook calls
- Predictable resource usage
- No cascades

---

## 🚀 Quick Migration (5 Steps)

### 1. Deploy Function
```bash
supabase functions deploy sync-threads-processor --project-ref fdaqphksmlmupyrsatcz
```

### 2. Create New Webhook
- Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
- Create webhook:
  - **Name**: `trigger-thread-processor`
  - **Table**: `thread_processing_stages`
  - **Event**: INSERT
  - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/sync-threads-processor`
  - **Filter**: `current_stage = 'pending'`

### 3. Disable Old Webhooks
Disable these 4 webhooks (don't delete):
- `trigger-thread-importer`
- `trigger-thread-preprocessor`
- `trigger-thread-cleaner`
- `trigger-thread-chunker`

### 4. Test
- Run a small sync (1-2 threads)
- Verify threads process through all stages
- Check logs for no cascade

### 5. Monitor
- Watch for 24-48 hours
- If stable, delete old webhooks

---

## 📚 Detailed Guides

- **Full Migration Guide**: `MIGRATION_GUIDE_UNIFIED_ORCHESTRATOR.md`
- **Webhook Details**: `WEBHOOK_ADJUSTMENT_GUIDE.md`

---

## ✅ Keep These Webhooks Active

- ✅ `trigger-page-worker` (creates threads)
- ✅ `trigger-thread-processor` (NEW - processes threads)
- ✅ `trigger-thread-summarizer` (summarization)
- ✅ `trigger-completion-checker` (completion check)

---

## 🔄 Rollback

If issues occur:
1. Disable `trigger-thread-processor`
2. Re-enable old webhooks (2-5)
3. System resumes old behavior

---

**That's it!** The unified orchestrator eliminates webhook cascades while keeping the same functionality.

