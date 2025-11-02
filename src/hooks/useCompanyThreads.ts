'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { Thread } from '@/lib/types/threads';
import { getThreadIdsForCompany, getThreadsByIds } from '@/lib/threads/queries';

export function useCompanyThreads(companyId: string | null) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const fetchThreads = async () => {
      try {
        setLoading(true);
        setError(null);

        // First, get thread IDs linked to this company
        const { data: links, error: linksError } = await getThreadIdsForCompany(supabase, companyId);

        if (linksError) throw linksError;

        if (!links || links.length === 0) {
          setThreads([]);
          setLoading(false);
          return;
        }

        const threadIds = links.map((link) => link.thread_id);

        // Fetch threads
        const { data: threadsData, error: threadsError } = await getThreadsByIds(supabase, threadIds);

        if (threadsError) throw threadsError;

        setThreads(threadsData || []);
      } catch (err) {
        console.error('Error fetching threads:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch threads');
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();

    // Subscribe to realtime changes on thread_company_link (since threads don't have company_id directly)
    // When a new link is created, we'll refetch. Also subscribe to threads table for updates.
    const channel = supabase
      .channel(`company-threads-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'threads'
        },
        (payload) => {
          console.log('Realtime threads update:', payload);
          // Refetch threads when changes occur (we'll filter by company in the refetch)
          fetchThreads();
        }
      )
      .subscribe();

    // Also subscribe to thread_company_link changes
    const linkChannel = supabase
      .channel(`company-thread-links-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'thread_company_link',
          filter: `company_id=eq.${companyId}`
        },
        () => {
          // Refetch when links change
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(linkChannel);
    };
  }, [companyId, supabase]);

  return { threads, loading, error };
}

