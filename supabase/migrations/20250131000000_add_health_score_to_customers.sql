-- Add health_score column to customers table and sentiment_score to thread_messages table

-- 1. Add health_score column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0;

-- Add constraint to ensure health_score is between -100 and 100
ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_health_score_check;

ALTER TABLE public.customers
ADD CONSTRAINT customers_health_score_check 
CHECK (health_score >= -100 AND health_score <= 100);

-- Add comment for clarity
COMMENT ON COLUMN public.customers.health_score IS 'Customer health score ranging from -100 (very negative) to 100 (very positive), default 0 (neutral)';

-- 2. Add sentiment_score column to thread_messages table
ALTER TABLE public.thread_messages 
ADD COLUMN IF NOT EXISTS sentiment_score INTEGER;

-- Add constraint to ensure sentiment_score is between -2 and 2
ALTER TABLE public.thread_messages
DROP CONSTRAINT IF EXISTS thread_messages_sentiment_score_check;

ALTER TABLE public.thread_messages
ADD CONSTRAINT thread_messages_sentiment_score_check 
CHECK (sentiment_score IS NULL OR (sentiment_score >= -2 AND sentiment_score <= 2));

-- Add comment for clarity
COMMENT ON COLUMN public.thread_messages.sentiment_score IS 'Numeric sentiment score: -2 (very negative), -1 (negative), 0 (neutral), 1 (positive), 2 (very positive)';

-- 3. Create indexes for efficient health score calculations
CREATE INDEX IF NOT EXISTS idx_thread_messages_customer_id_sentiment_score 
ON public.thread_messages(customer_id, sentiment_score) 
WHERE customer_id IS NOT NULL AND sentiment_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_health_score 
ON public.customers(health_score);

