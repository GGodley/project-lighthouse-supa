-- Add overall_sentiment column to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS overall_sentiment TEXT;

-- Add comment for the new column
COMMENT ON COLUMN companies.overall_sentiment IS 'Overall sentiment status: Healthy, At Risk, or null';

-- Update existing companies to have a default value if needed
UPDATE companies 
SET overall_sentiment = 'Healthy' 
WHERE overall_sentiment IS NULL;
