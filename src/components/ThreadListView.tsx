'use client';

import React from 'react';
import { Mail } from 'lucide-react';
import { Thread, LLMSummary } from '@/lib/types/threads';

interface ThreadListViewProps {
  threads: Thread[];
  onThreadSelect: (threadId: string) => void;
  selectedThreadId: string | null;
}

export default function ThreadListView({ threads, onThreadSelect, selectedThreadId }: ThreadListViewProps) {
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  const getSentimentColor = (sentiment: string | null): string => {
    if (!sentiment) return 'bg-gray-100 text-gray-800';
    switch (sentiment.toLowerCase()) {
      case 'positive':
      case 'very positive':
        return 'bg-green-100 text-green-800';
      case 'neutral':
        return 'bg-blue-100 text-blue-800';
      case 'frustrated':
      case 'negative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {threads.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No threads found for this company.</p>
        </div>
      ) : (
        threads.map((thread) => {
          const summary = thread.llm_summary;
          const isError = summary !== null && 'error' in summary;
          const llmSummary = isError ? null : (summary as LLMSummary | null);
          const customerSentiment = llmSummary?.customer_sentiment || null;
          const problemStatement = llmSummary?.problem_statement || 'No summary available';
          const isSelected = selectedThreadId === thread.thread_id;

          return (
            <div
              key={thread.thread_id}
              onClick={() => onThreadSelect(thread.thread_id)}
              className={`bg-white border rounded-lg shadow-sm p-4 cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-purple-600" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {thread.subject || 'No Subject'}
                    </h3>
                    <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
                      {formatDate(thread.last_message_date)}
                    </span>
                  </div>

                  {/* Snippet */}
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {thread.snippet || 'No preview available'}
                  </p>

                  {/* Summary Info */}
                  {llmSummary && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Problem: </span>
                        {problemStatement.length > 150 
                          ? `${problemStatement.substring(0, 150)}...` 
                          : problemStatement}
                      </p>
                      {customerSentiment && (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getSentimentColor(customerSentiment)}`}>
                          {customerSentiment}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Key Participants */}
                  {llmSummary && llmSummary.key_participants && Array.isArray(llmSummary.key_participants) && llmSummary.key_participants.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">
                        Participants: {llmSummary.key_participants.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

