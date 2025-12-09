-- Script to check for and remove any active CRON jobs for thread sync
-- Run this in Supabase SQL Editor to ensure we're using webhooks only

-- 1. Check for active cron jobs related to thread sync
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job 
WHERE jobname LIKE 'sync-threads%'
ORDER BY jobname;

-- 2. Check cron job run history (to see if they're actually running)
SELECT 
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status,
  jrd.return_message
FROM cron.job_run_details jrd
JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname LIKE 'sync-threads%'
ORDER BY jrd.start_time DESC
LIMIT 20;

-- 3. Remove all thread sync cron jobs (if any exist)
-- WARNING: Only run this if you want to remove the cron jobs
-- Uncomment the lines below to actually remove them:

/*
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobid, jobname 
    FROM cron.job 
    WHERE jobname LIKE 'sync-threads%'
  LOOP
    RAISE NOTICE 'Removing cron job: % (jobid: %)', job_record.jobname, job_record.jobid;
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
  
  RAISE NOTICE 'All thread sync cron jobs removed. Using webhooks only now.';
END $$;
*/

-- 4. Verify no cron jobs remain
SELECT 
  COUNT(*) as remaining_cron_jobs
FROM cron.job 
WHERE jobname LIKE 'sync-threads%';

-- Expected result: 0 (if all removed)

