# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Lighthouse application.

## Functions

### 1. process-summarization-queue

**Purpose**: Processes summarization jobs on a schedule to generate email summaries using OpenAI.

**Features**:
- Queries `summarization_jobs` table for pending jobs (batch of 5)
- Fetches email body text from `emails` table
- Calls OpenAI API to generate summaries
- Updates email records with summaries
- Updates job status to 'completed' or 'failed'

**Environment Variables Required**:
- `OPENAI_API_KEY`: OpenAI API key for generating summaries
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

**Usage**: This function should be called on a schedule (e.g., every 5 minutes) using a cron job or external scheduler.

### 2. add-to-summarization-queue

**Purpose**: Adds emails to the summarization queue for processing.

**Features**:
- Accepts an array of email IDs
- Creates summarization jobs with 'pending' status
- Returns job details for tracking

**Request Body**:
```json
{
  "emailIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Added 3 emails to summarization queue",
  "jobs": [...]
}
```

## Database Schema

### summarization_jobs table
- `id`: UUID primary key
- `email_id`: UUID foreign key to emails table
- `status`: Text ('pending', 'processing', 'completed', 'failed')
- `details`: Text (error messages or success details)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### emails table (updated)
- `summary`: Text column added for storing AI-generated summaries

## Deployment

1. Deploy the functions:
```bash
supabase functions deploy process-summarization-queue
supabase functions deploy add-to-summarization-queue
```

2. Run the migration:
```bash
supabase db push
```

3. Set up environment variables in Supabase dashboard:
   - `OPENAI_API_KEY`

## Scheduling

To run the summarization queue processor on a schedule, you can:

1. Use Supabase's built-in cron functionality (if available)
2. Set up an external cron job to call the function
3. Use a service like GitHub Actions, Vercel Cron, or similar

Example cron job (every 5 minutes):
```bash
*/5 * * * * curl -X POST https://your-project.supabase.co/functions/v1/process-summarization-queue
```

## Error Handling

The functions include comprehensive error handling:
- Database connection errors
- OpenAI API errors
- Missing data validation
- Job status tracking
- Detailed logging for debugging
