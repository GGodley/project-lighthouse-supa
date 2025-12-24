// Next step structure extracted from LLM
export type NextStep = {
  text: string;
  owner: string | null;
  due_date: string | null; // YYYY-MM-DD format or null
  priority?: 'high' | 'medium' | 'low' | null; // Priority level from LLM
};

// The structured JSON summary from the LLM
export type LLMSummary = {
  problem_statement?: string;
  key_participants?: string[];
  timeline_summary?: string;
  resolution_status?: string;
  customer_sentiment?: string;
  sentiment_score?: number;
  next_steps?: NextStep[];
  // Alternative field names that may be used
  summary?: string; // Primary summary field (alternative to problem_statement)
  open_next_steps?: NextStep[]; // Alternative to next_steps
  // Legacy field for backward compatibility (deprecated)
  csm_next_step?: string;
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

// Re-export SyncStatus and SyncJob from shared sync types
export { SyncStatus, type SyncStatusValue, type SyncJob } from './sync';

// --- NEW TYPE ---
// Represents a row in the public.domain_blocklist table
export type BlockedDomain = {
  id: number;
  user_id: string;
  domain: string;
  status: 'archived' | 'deleted';
  created_at: string; // ISO string
};

