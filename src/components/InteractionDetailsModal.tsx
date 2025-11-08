'use client';

import React from 'react';
import { X } from 'lucide-react';
import ThreadConversationView from './ThreadConversationView';
import MeetingTranscriptView from './MeetingTranscriptView';
import InteractionSummarySidebar from './InteractionSummarySidebar';
import { LLMSummary } from '@/lib/types/threads';

interface Interaction {
  interaction_type: 'email' | 'meeting';
  interaction_date: string;
  id: string;
  title: string;
  summary: string;
  sentiment: string;
  thread_id?: string | null;
  transcription_job_id?: string | null;
  llm_summary?: LLMSummary | { error: string } | null;
  next_steps?: string[];
}

interface InteractionDetailsModalProps {
  interaction: Interaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function InteractionDetailsModal({
  interaction,
  isOpen,
  onClose
}: InteractionDetailsModalProps) {
  if (!isOpen || !interaction) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getSummary = (): LLMSummary | { error: string } | null => {
    if (interaction.llm_summary) {
      return interaction.llm_summary;
    }
    return null;
  };

  const getNextSteps = (): string[] => {
    return interaction.next_steps || [];
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {interaction.interaction_type === 'email' ? 'Email Thread' : 'Meeting Transcript'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(interaction.interaction_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content Area - Two Column Layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Column - Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {interaction.interaction_type === 'email' && interaction.thread_id ? (
                <ThreadConversationView
                  threadId={interaction.thread_id}
                  threadSummary={getSummary()}
                  onClose={onClose}
                  showSummarySidebar={false}
                />
              ) : interaction.interaction_type === 'meeting' && interaction.transcription_job_id ? (
                <MeetingTranscriptView
                  transcriptionJobId={interaction.transcription_job_id}
                />
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <p>
                    {interaction.interaction_type === 'email'
                      ? 'Thread data not available for this email.'
                      : 'Transcript data not available for this meeting.'}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column - Fixed Sidebar */}
            <div className="w-80 border-l border-gray-200 flex-shrink-0">
              <div className="sticky top-0 h-full">
                <InteractionSummarySidebar
                  summary={getSummary()}
                  nextSteps={getNextSteps()}
                  interactionType={interaction.interaction_type}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

