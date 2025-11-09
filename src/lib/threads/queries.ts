import type { SupabaseClient } from '@supabase/supabase-js';
import type { Thread, ThreadMessage } from '@/lib/types/threads';

interface ThreadCompanyLink {
  thread_id: string;
}

// Type for Supabase query response
type SupabaseQueryResponse<T> = {
  data: T | null;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
};

/**
 * Type-safe helper to query thread_company_link table
 * Note: This table is not yet in generated database types.
 * Uses type assertion through unknown (safer than any) to access untyped tables.
 */
export async function getThreadIdsForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<SupabaseQueryResponse<ThreadCompanyLink[]>> {
  // Cast through unknown to avoid 'any' - this is necessary until types are regenerated
  type UntypedSupabase = {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<SupabaseQueryResponse<ThreadCompanyLink[]>>;
      };
    };
  };

  const client = supabase as unknown as UntypedSupabase;

  return await client
    .from('thread_company_link')
    .select('thread_id')
    .eq('company_id', companyId);
}

/**
 * Type-safe helper to query threads table
 * Note: This table is not yet in generated database types.
 * Uses type assertion through unknown (safer than any) to access untyped tables.
 */
export async function getThreadsByIds(
  supabase: SupabaseClient,
  threadIds: string[]
): Promise<SupabaseQueryResponse<Thread[]>> {
  // Cast through unknown to avoid 'any' - this is necessary until types are regenerated
  type UntypedSupabase = {
    from: (table: string) => {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          order: (column: string, options: { ascending: boolean }) => Promise<SupabaseQueryResponse<Thread[]>>;
        };
      };
    };
  };

  const client = supabase as unknown as UntypedSupabase;

  return await client
    .from('threads')
    .select('*')
    .in('thread_id', threadIds)
    .order('last_message_date', { ascending: false });
}

/**
 * Type-safe helper to query thread_messages table
 * Note: This table is not yet in generated database types.
 * Uses type assertion through unknown (safer than any) to access untyped tables.
 */
export async function getThreadMessages(
  supabase: SupabaseClient,
  threadId: string
): Promise<SupabaseQueryResponse<ThreadMessage[]>> {
  // Cast through unknown to avoid 'any' - this is necessary until types are regenerated
  type UntypedSupabase = {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<SupabaseQueryResponse<ThreadMessage[]>>;
        };
      };
    };
  };

  const client = supabase as unknown as UntypedSupabase;

  return await client
    .from('thread_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_date', { ascending: true });
}

/**
 * Type-safe helper to query a single thread by thread_id
 * Note: This table is not yet in generated database types.
 * Uses type assertion through unknown (safer than any) to access untyped tables.
 */
export async function getThreadById(
  supabase: SupabaseClient,
  threadId: string
): Promise<SupabaseQueryResponse<Thread>> {
  // Cast through unknown to avoid 'any' - this is necessary until types are regenerated
  type UntypedSupabase = {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<SupabaseQueryResponse<Thread>>;
        };
      };
    };
  };

  const client = supabase as unknown as UntypedSupabase;

  return await client
    .from('threads')
    .select('*')
    .eq('thread_id', threadId)
    .single();
}

