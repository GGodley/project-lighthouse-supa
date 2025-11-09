-- Backfill sentiment_score in thread_messages and calculate health scores for all customers

-- Step 1: Extract sentiment_score from threads.llm_summary for existing thread_messages
-- Map old sentiment text values to new sentiment_score values
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
    -- Map old sentiment text to new sentiment_score
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

-- Step 2: Migrate old sentiment scores if they exist in the old format (3, 2, 0, -2, -3)
-- This handles any edge cases where old scores might be stored
UPDATE public.thread_messages
SET sentiment_score = CASE
  WHEN sentiment_score = 3 THEN 2   -- Very Positive: 3 -> 2
  WHEN sentiment_score = 2 THEN 1   -- Positive: 2 -> 1
  WHEN sentiment_score = 0 THEN 0   -- Neutral: 0 -> 0
  WHEN sentiment_score = -2 THEN -1   -- Negative: -2 -> -1
  WHEN sentiment_score = -3 THEN -2  -- Frustrated: -3 -> -2
  ELSE sentiment_score
END
WHERE sentiment_score IS NOT NULL
  AND sentiment_score NOT BETWEEN -2 AND 2;

-- Step 3: Calculate and set health_score for all customers
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

-- Step 4: Set health_score to 0 for customers with no analyzed messages
UPDATE public.customers
SET health_score = 0
WHERE health_score IS NULL;

