-- Create function to update meetings from transcription jobs using meeting_id
CREATE OR REPLACE FUNCTION update_meeting_from_transcription()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the meetings table with transcription data using meeting_id from transcription_jobs
  -- to match with google_event_id in meetings table
  UPDATE public.meetings 
  SET 
    summary = NEW.summary,
    topics = NEW.iab_categories,
    next_steps = NEW.highlights->'action_items',
    outstanding_issues = NEW.highlights->'outstanding_issues',
    updated_at = NOW()
  WHERE google_event_id = NEW.meeting_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update meetings when transcription jobs are updated
CREATE TRIGGER trigger_update_meeting_from_transcription
  AFTER UPDATE ON public.transcription_jobs
  FOR EACH ROW
  WHEN (NEW.summary IS NOT NULL AND OLD.summary IS NULL)
  EXECUTE FUNCTION update_meeting_from_transcription();
