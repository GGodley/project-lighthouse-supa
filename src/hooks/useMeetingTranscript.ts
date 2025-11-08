'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import type { Database } from '@/types/database';

type TranscriptionJob = Database['public']['Tables']['transcription_jobs']['Row'];

export interface Utterance {
  speaker: string;
  start: number; // timestamp in milliseconds
  end: number; // timestamp in milliseconds
  text: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export function useMeetingTranscript(transcriptionJobId: string | null | undefined) {
  const [transcriptionJob, setTranscriptionJob] = useState<TranscriptionJob | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();

  useEffect(() => {
    if (!transcriptionJobId) {
      setLoading(false);
      return;
    }

    const fetchTranscript = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('transcription_jobs')
          .select('*')
          .eq('id', transcriptionJobId)
          .single();

        if (fetchError) throw fetchError;

        setTranscriptionJob(data);

        // Parse utterances from JSONB
        if (data?.utterances) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const utterancesData = data.utterances as any;
            
            // Handle different possible structures
            if (Array.isArray(utterancesData)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const parsedUtterances: Utterance[] = utterancesData.map((u: any) => ({
                speaker: u.speaker || u.speaker_label || 'Unknown',
                start: u.start || 0,
                end: u.end || 0,
                text: u.text || '',
                words: u.words || []
              }));
              setUtterances(parsedUtterances);
            } else {
              // If it's an object with a different structure, try to extract
              console.warn('Unexpected utterances structure:', utterancesData);
              setUtterances([]);
            }
          } catch (parseError) {
            console.error('Error parsing utterances:', parseError);
            setUtterances([]);
          }
        } else {
          setUtterances([]);
        }
      } catch (err) {
        console.error('Error fetching transcript:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch transcript');
      } finally {
        setLoading(false);
      }
    };

    fetchTranscript();
  }, [transcriptionJobId, supabase]);

  return { transcriptionJob, utterances, loading, error };
}

