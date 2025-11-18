# 🚀 Deployment Status and Manual Setup Instructions

## ✅ **Edge Functions - ALL DEPLOYED**

All edge functions have been successfully deployed to Supabase:

- ✅ `process-events` (v38) - Updated to detect and store meeting types
- ✅ `dispatch-recall-bot` (v51) - Updated to support both Google Meet and Zoom
- ✅ `process-summary` (v11) - Updated to trigger cleanup after completion
- ✅ `cleanup-meeting-data` (v3) - Already deployed and working

**Status**: All functions are ACTIVE and up to date.

---

## 📊 **Database Migrations**

### Migration Status

The migration `20251116215750_add_meeting_type_support.sql` exists locally but needs to be applied to the remote database.

**Note**: You mentioned you already ran a migration manually in the dashboard. If you ran the meeting_type migration, you can skip to the verification step below.

### Option 1: Run Migration via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new
2. Copy and paste the SQL from `supabase/migrations/20251116215750_add_meeting_type_support.sql`
3. Run the SQL script

### Option 2: Verify Migration Already Applied

Run this query in the Supabase Dashboard SQL Editor to verify the columns exist:

```sql
-- Verify migration was applied
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'meetings'
  AND column_name IN ('meeting_type', 'meeting_url');
```

**Expected Result**: You should see both `meeting_type` and `meeting_url` columns.

---

## 🔗 **Manual Integrations Required: Database Webhooks**

You need to configure **2 database webhooks** in the Supabase Dashboard to complete the meeting processing flow:

### Webhook 1: Trigger `generate-summary` when transcript is ready

**Purpose**: Automatically generate AI summary when a transcript is received from Recall.ai

**Setup Steps**:
1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
2. Click **"Create a new webhook"**
3. Configure as follows:
   - **Name**: `trigger-generate-summary`
   - **Table**: `transcription_jobs`
   - **Events**: Select **"Update"** only
   - **Type**: **"HTTP Request"**
   - **HTTP Request**:
     - **Method**: `POST`
     - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/generate-summary`
     - **HTTP Headers**:
       ```
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       Content-Type: application/json
       ```
     - **HTTP Body** (select "JSON"):
       ```json
       {
         "record": {
           "id": "{{ $1.id }}",
           "transcript_text": "{{ $1.transcript_text }}",
           "meeting_id": "{{ $1.meeting_id }}",
           "user_id": "{{ $1.user_id }}",
           "customer_id": "{{ $1.customer_id }}",
           "status": "{{ $1.status }}"
         }
       }
       ```
   - **Filter**: Add a filter condition:
     - **Column**: `status`
     - **Operator**: `=`
     - **Value**: `awaiting_summary`
   - **Advanced Options**:
     - Enable **"Only trigger on specific column changes"**
     - Select column: `status`

4. Click **"Save"**

### Webhook 2: Trigger `process-summary` when summary is generated

**Purpose**: Process the AI-generated summary and update the meetings table, then trigger cleanup

**Setup Steps**:
1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
2. Click **"Create a new webhook"**
3. Configure as follows:
   - **Name**: `trigger-process-summary`
   - **Table**: `transcription_jobs`
   - **Events**: Select **"Update"** only
   - **Type**: **"HTTP Request"**
   - **HTTP Request**:
     - **Method**: `POST`
     - **URL**: `https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summary`
     - **HTTP Headers**:
       ```
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       Content-Type: application/json
       ```
     - **HTTP Body** (select "JSON"):
       ```json
       {
         "record": {
           "id": "{{ $1.id }}",
           "meeting_id": "{{ $1.meeting_id }}",
           "summary_raw_response": "{{ $1.summary_raw_response }}",
           "recall_bot_id": "{{ $1.recall_bot_id }}",
           "status": "{{ $1.status }}"
         }
       }
       ```
   - **Filter**: Add a filter condition:
     - **Column**: `status`
     - **Operator**: `=`
     - **Value**: `summary_received`
   - **Advanced Options**:
     - Enable **"Only trigger on specific column changes"**
     - Select column: `status`

4. Click **"Save"**

### How to Get Your Service Role Key

1. Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/settings/api
2. Find **"service_role"** key (⚠️ Keep this secret!)
3. Copy the key and use it in the webhook headers

---

## 🔄 **Complete Flow Overview**

Here's how the entire meeting processing flow works:

1. **Calendar Sync** → `sync-calendar` function syncs Google Calendar events
2. **Process Events** → `process-events` detects meeting type (Google Meet/Zoom) and stores in `meetings` table
3. **Dispatch Bot** → `dispatch-recall-bot` sends Recall.ai bot to meeting (works for both platforms)
4. **Receive Transcript** → `process-transcript` receives webhook from Recall.ai, stores transcript, sets status to `awaiting_summary`
5. **Generate Summary** → **Database Webhook 1** triggers `generate-summary` when status = `awaiting_summary`
6. **Process Summary** → **Database Webhook 2** triggers `process-summary` when status = `summary_received`
7. **Cleanup** → `process-summary` automatically invokes `cleanup-meeting-data` to delete Recall.ai media

---

## ✅ **Verification Checklist**

After completing the setup, verify everything works:

### 1. Verify Migration Applied
```sql
SELECT 
  COUNT(*) as total_meetings,
  COUNT(meeting_url) as meetings_with_url,
  COUNT(meeting_type) as meetings_with_type,
  COUNT(CASE WHEN meeting_type = 'google_meet' THEN 1 END) as google_meet_count,
  COUNT(CASE WHEN meeting_type = 'zoom' THEN 1 END) as zoom_count
FROM meetings;
```

### 2. Verify Webhooks Are Active
- Go to: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/database/webhooks
- Verify both webhooks show as **"Active"**

### 3. Test the Flow
1. Create a test meeting with a Zoom link in Google Calendar
2. Sync the calendar
3. Verify the meeting is detected as type `zoom`
4. Verify the bot is dispatched successfully
5. After transcript is received, verify summary is generated
6. After summary is processed, verify cleanup is triggered

---

## 📝 **Summary**

✅ **Edge Functions**: All deployed and up to date  
⚠️ **Migrations**: Need to verify/apply `20251116215750_add_meeting_type_support.sql`  
⚠️ **Webhooks**: Need to manually configure 2 database webhooks (see instructions above)

**No other manual integrations are required** - the Recall.ai webhook for `process-transcript` should already be configured in your Recall.ai dashboard.

