-- Add sentiment_score column to meetings table for numeric sentiment scoring
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS sentiment_score INTEGER;

-- Add comment for the new column
COMMENT ON COLUMN meetings.sentiment_score IS 'Numeric sentiment score: 3 (Very Positive), 2 (Positive), 1 (Neutral), -2 (Negative), -3 (Frustrated)';

-- Update existing sentiment values to match new categories
UPDATE meetings 
SET customer_sentiment = CASE 
  WHEN customer_sentiment = 'positive' THEN 'Positive'
  WHEN customer_sentiment = 'negative' THEN 'Negative'
  WHEN customer_sentiment = 'neutral' THEN 'Neutral'
  ELSE 'Neutral'
END
WHERE customer_sentiment IN ('positive', 'negative', 'neutral');

-- Update the existing sentiment constraint to allow the new sentiment categories
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_sentiment_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_sentiment_check 
CHECK (customer_sentiment IN ('Very Positive', 'Positive', 'Neutral', 'Negative', 'Frustrated'));
