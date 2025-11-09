// The structured JSON summary from the LLM
export type LLMSummary = {
  problem_statement: string;
  key_participants: string[];
  timeline_summary: string;
  resolution_status: string;
  customer_sentiment: string;
  csm_next_step: string;
};

// Represents a row in the new public.threads table
export type Thread = {
  thread_id: string;
  user_id: string;
  subject: string | null;
  snippet: string | null;
  last_message_date: string | null; // ISO string
  llm_summary: LLMSummary | { error: string } | null;
  llm_summary_updated_at: string | null; // ISO string
  created_at: string; // ISO string
};

// Represents a row in the new public.thread_messages table
export type ThreadMessage = {
  message_id: string;
  thread_id: string;
  user_id: string;
  customer_id: string | null; // UUID
  from_address: string | null;
  to_addresses: string[] | null; // Stored as JSONB in DB
  cc_addresses: string[] | null; // Stored as JSONB in DB
  sent_date: string | null; // ISO string
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  created_at: string; // ISO string
};

// Defines the states for the sync job
export type SyncStatus = 'idle' | 'creating_job' | 'syncing' | 'completed' | 'failed' | 'pending';

// Represents a row in the public.sync_jobs table
export type SyncJob = {
  id: number; // Job ID (BIGINT in DB)
  status: SyncStatus;
  details: string | null;
  user_id: string;
  created_at: string; // ISO string
  updated_at: string; // ISO string
};

// --- NEW TYPE ---
// Represents a row in the public.domain_blocklist table
export type BlockedDomain = {
  id: number;
  user_id: string;
  domain: string;
  status: 'archived' | 'deleted';
  created_at: string; // ISO string
};

