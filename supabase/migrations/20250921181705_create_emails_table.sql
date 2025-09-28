-- Create the emails table
CREATE TABLE emails (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT,
  sender TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comments for clarity
COMMENT ON TABLE emails IS 'Stores email data fetched from the Gmail API.';
COMMENT ON COLUMN emails.user_id IS 'Links to the authenticated user.';

-- Enable Row Level Security
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to view only their own emails
CREATE POLICY "Users can view their own emails"
ON emails FOR SELECT
USING (auth.uid() = user_id);

-- Create a policy that allows users to insert emails only for themselves
CREATE POLICY "Users can insert their own emails"
ON emails FOR INSERT
WITH CHECK (auth.uid() = user_id);
