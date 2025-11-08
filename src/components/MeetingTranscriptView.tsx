'use client';

import React from 'react';
import { useMeetingTranscript, Utterance } from '@/hooks/useMeetingTranscript';

interface MeetingTranscriptViewProps {
  transcriptionJobId: string | null;
}

export default function MeetingTranscriptView({ transcriptionJobId }: MeetingTranscriptViewProps) {
  const { utterances, loading, error } = useMeetingTranscript(transcriptionJobId);

  const formatTimestamp = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading transcript...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-red-600">Error loading transcript: {error}</p>
      </div>
    );
  }

  if (!utterances || utterances.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-gray-500">No transcript available for this meeting.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Transcript</h3>
        
        <div className="space-y-6">
          {utterances.map((utterance: Utterance, index: number) => (
            <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">
                    {utterance.speaker || 'Unknown Speaker'}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatTimestamp(utterance.start)}
                  </span>
                </div>
              </div>
              <p className="text-gray-700 leading-relaxed">
                {utterance.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

