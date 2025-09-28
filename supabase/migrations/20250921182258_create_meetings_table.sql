-- Create the meetings table to store summaries, topics, attendants, and sentiment
CREATE TABLE meetings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  summary TEXT,
  topics JSONB,
  attendants JSONB,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  meeting_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comments for clarity
COMMENT ON TABLE meetings IS 'Stores data and summaries from user meetings.';
COMMENT ON COLUMN meetings.user_id IS 'Links to the authenticated user who owns the meeting data.';
COMMENT ON COLUMN meetings.topics IS 'Stores a list of topics, e.g., ["Q3 Planning", "Product Launch"].';
COMMENT ON COLUMN meetings.attendants IS 'Stores a list of attendant objects, e.g., [{"name": "Jane Doe", "email": "jane@example.com"}].';

-- Enable Row Level Security to protect user data
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to view only their own meetings
CREATE POLICY "Users can view their own meetings"
ON meetings FOR SELECT
USING (auth.uid() = user_id);

-- Create a policy that allows users to insert meetings only for themselves
CREATE POLICY "Users can insert their own meetings"
ON meetings FOR INSERT
WITH CHECK (auth.uid() = user_id);
