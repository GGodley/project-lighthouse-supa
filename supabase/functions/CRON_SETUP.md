# Cron Job Setup for Thread Sync Workers

The new parallel staged thread sync architecture requires scheduled workers to process jobs from queues. Set up the following cron jobs to run the worker functions.

## Required Cron Jobs

### 1. Page Worker (Every 30 seconds)
Processes Gmail API pagination and enqueues threads.

```sql
-- Supabase SQL Editor
SELECT cron.schedule(
  'sync-threads-page-worker',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-page-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 2. Importer Worker (Every 30 seconds)
Stage 1: Fetches full thread data from Gmail API.

```sql
SELECT cron.schedule(
  'sync-threads-importer',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-importer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 3. Preprocessor Worker (Every 30 seconds)
Stage 2: Company/customer discovery with batch pre-fetching.

```sql
SELECT cron.schedule(
  'sync-threads-preprocessor',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-preprocessor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 4. Cleaner Worker (Every 30 seconds)
Stage 3: Body text cleaning.

```sql
SELECT cron.schedule(
  'sync-threads-cleaner',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-cleaner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 5. Chunker Worker (Every 30 seconds)
Stage 4: Chunk preparation for OpenAI.

```sql
SELECT cron.schedule(
  'sync-threads-chunker',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-chunker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 6. Summarizer Worker (Every 60 seconds)
Stage 5: OpenAI summarization (slower due to rate limits).

```sql
SELECT cron.schedule(
  'sync-threads-summarizer',
  '*/60 * * * * *', -- Every 60 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-summarizer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 7. Completion Checker (Every 60 seconds)
Checks if all threads are processed and marks sync jobs as completed.

```sql
SELECT cron.schedule(
  'sync-threads-completion-checker',
  '*/60 * * * * *', -- Every 60 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-threads-completion-checker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## Alternative: External Scheduler

If you prefer using an external scheduler (e.g., GitHub Actions, Vercel Cron, or a dedicated cron service), you can set up HTTP requests to these endpoints on the same schedule.

## Verification

After setting up cron jobs, verify they're running:

```sql
-- Check active cron jobs
SELECT * FROM cron.job WHERE jobname LIKE 'sync-threads%';

-- Check cron job run history
SELECT * FROM cron.job_run_details 
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'sync-threads%')
ORDER BY start_time DESC
LIMIT 50;
```

## Notes

- Replace `YOUR_PROJECT` with your Supabase project reference
- Replace `YOUR_ANON_KEY` with your Supabase anon key (or use service role key for internal calls)
- The cron extension must be enabled in your Supabase project
- Monitor function logs to ensure workers are processing jobs correctly
- Adjust intervals based on your workload (more frequent = faster processing, but higher API usage)

