-- Extract sentiment_score from existing thread llm_summary and update thread_messages
-- This handles threads that were synced before the sentiment_score extraction was added

-- Step 1: Update thread_messages with sentiment_score from threads.llm_summary
UPDATE public.thread_messages tm
SET sentiment_score = CASE
  WHEN t.llm_summary->>'sentiment_score' IS NOT NULL THEN
    -- If sentiment_score exists in JSON, use it (validate it's in range)
    CASE
      WHEN (t.llm_summary->>'sentiment_score')::INTEGER BETWEEN -2 AND 2 
        THEN (t.llm_summary->>'sentiment_score')::INTEGER
      ELSE 0
    END
  WHEN t.llm_summary->>'customer_sentiment' IS NOT NULL THEN
    -- Map sentiment text to new sentiment_score
    CASE
      WHEN t.llm_summary->>'customer_sentiment' = 'Very Positive' THEN 2
      WHEN t.llm_summary->>'customer_sentiment' = 'Positive' THEN 1
      WHEN t.llm_summary->>'customer_sentiment' = 'Neutral' THEN 0
      WHEN t.llm_summary->>'customer_sentiment' = 'Negative' THEN -1
      WHEN t.llm_summary->>'customer_sentiment' = 'Very Negative' THEN -2
      WHEN t.llm_summary->>'customer_sentiment' = 'Frustrated' THEN -2  -- Map old "Frustrated" to -2
      ELSE 0  -- Default to neutral
    END
  ELSE 0  -- Default to neutral if no sentiment found
END
FROM public.threads t
WHERE tm.thread_id = t.thread_id
  AND tm.customer_id IS NOT NULL  -- Only update customer messages
  AND tm.sentiment_score IS NULL;  -- Only update if not already set

-- Step 2: Recalculate customer health scores for all customers
DO $$
DECLARE
  customer_record RECORD;
BEGIN
  FOR customer_record IN 
    SELECT DISTINCT customer_id 
    FROM public.thread_messages 
    WHERE customer_id IS NOT NULL
  LOOP
    PERFORM public.calculate_customer_health_score(customer_record.customer_id);
  END LOOP;
END $$;

-- Step 3: Recalculate company health scores for all companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN 
    SELECT DISTINCT company_id 
    FROM public.companies
  LOOP
    PERFORM public.calculate_company_health_score(company_record.company_id);
  END LOOP;
END $$;

