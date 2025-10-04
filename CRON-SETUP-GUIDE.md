# 🕐 Cron Job Setup Guide for Summarization Queue

## ✅ **Functions Deployed Successfully!**

Your summarization queue system is now live with the following functions:
- ✅ `process-summarization-queue` - Processes jobs in batches
- ✅ `add-to-summarization-queue` - Adds emails to queue

## 🚀 **Setting Up Automatic Processing**

Since Supabase Edge Functions don't support built-in cron scheduling, you have several options to automatically trigger the `process-summarization-queue` function:

### **Option 1: External Cron Job (Recommended)**

Set up a cron job on your server or use a service like GitHub Actions:

#### **Server Cron Job:**
```bash
# Add this to your crontab (crontab -e)
# Run every 5 minutes
*/5 * * * * curl -X POST https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

#### **GitHub Actions (Free):**
Create `.github/workflows/summarization-cron.yml`:
```yaml
name: Process Summarization Queue
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  process-queue:
    runs-on: ubuntu-latest
    steps:
      - name: Process Summarization Queue
        run: |
          curl -X POST https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

### **Option 2: Vercel Cron Jobs**

If you're using Vercel for deployment:

1. Create `api/cron/summarization.ts`:
```typescript
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const response = await fetch('https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  const data = await response.json()
  res.status(200).json(data)
}
```

2. Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/summarization",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### **Option 3: Manual Testing**

Test the function manually:
```bash
curl -X POST https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

## 🔧 **Environment Variables Required**

Make sure to set these in your Supabase Dashboard → Settings → Edge Functions:
- `OPENAI_API_KEY` - Your OpenAI API key for generating summaries

## 📊 **Monitoring Your Queue**

### **Check Queue Status:**
```sql
SELECT status, COUNT(*) 
FROM summarization_jobs 
GROUP BY status;
```

### **View Recent Jobs:**
```sql
SELECT * FROM summarization_jobs 
ORDER BY created_at DESC 
LIMIT 10;
```

### **Check Email Summaries:**
```sql
SELECT id, subject, summary 
FROM emails 
WHERE summary IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 10;
```

## 🎯 **Recommended Schedule**

- **Every 5 minutes**: Good balance between responsiveness and resource usage
- **Every minute**: For high-volume applications (be mindful of OpenAI API limits)
- **Every 15 minutes**: For low-volume applications

## 🚨 **Important Notes**

1. **OpenAI API Limits**: Monitor your usage to avoid hitting rate limits
2. **Batch Size**: The function processes 5 jobs at a time to prevent overload
3. **Error Handling**: Failed jobs are marked with error details for debugging
4. **Cost Management**: Each summary costs ~$0.001-0.002 depending on email length

## 🧪 **Testing Your Setup**

1. **Add emails to queue:**
```javascript
const { data, error } = await supabase.functions.invoke('add-to-summarization-queue', {
  body: { emailIds: ['email-id-1', 'email-id-2'] }
});
```

2. **Check if processing works:**
```bash
curl -X POST https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue
```

3. **Monitor the logs** in Supabase Dashboard → Edge Functions → Logs

---

**🎉 Your AI-powered email summarization system is ready to process emails automatically!**
