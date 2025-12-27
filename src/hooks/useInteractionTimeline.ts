'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';

export interface TimelineItem {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  type: 'conversation' | 'meeting';
}

export function useInteractionTimeline(companyId: string | null) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const fetchTimeline = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .rpc('get_interaction_timeline', { company_id_param: companyId });

        if (fetchError) throw fetchError;

        // Map the database response to TimelineItem[], ensuring type safety
        // Note: SQL function returns 'interaction_timestamp' but we map it to 'timestamp' for the component
        const timelineItems: TimelineItem[] = (data || []).map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          timestamp: item.interaction_timestamp,
          type: item.type === 'conversation' ? 'conversation' : 'meeting',
        }));

        setItems(timelineItems);
      } catch (err) {
        console.error('Error fetching interaction timeline:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [companyId, supabase]);

  return { items, loading, error };
}

