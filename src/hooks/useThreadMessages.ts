'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { ThreadMessage } from '@/lib/types/threads';
import { getThreadMessages } from '@/lib/threads/queries';

export function useThreadMessages(threadId: string | null) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: messagesData, error: messagesError } = await getThreadMessages(supabase, threadId);

        if (messagesError) throw messagesError;

        setMessages(messagesData || []);
      } catch (err) {
        console.error('Error fetching messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'thread_messages',
          filter: `thread_id=eq.${threadId}`
        },
        (payload) => {
          console.log('Realtime message update:', payload);
          // Refetch messages when changes occur
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, supabase]);

  return { messages, loading, error };
}

