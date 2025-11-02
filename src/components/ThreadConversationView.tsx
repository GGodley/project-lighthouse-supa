'use client';

import React from 'react';
import { Mail, User, X } from 'lucide-react';
import { useThreadMessages } from '@/hooks/useThreadMessages';
import { LLMSummary } from '@/lib/types/threads';

interface ThreadConversationViewProps {
  threadId: string;
  threadSummary: LLMSummary | { error: string } | null;
  onClose: () => void;
}

export default function ThreadConversationView({ threadId, threadSummary, onClose }: ThreadConversationViewProps) {
  const { messages, loading, error } = useThreadMessages(threadId);

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

  const parseEmailAddress = (addressString: string | null): { name: string; email: string } => {
    if (!addressString) return { name: '', email: '' };
    
    const match = addressString.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
    if (match) {
      if (match[1] && match[2]) {
        return { name: match[1].replace(/"/g, ''), email: match[2] };
      }
      return { name: match[3], email: match[3] };
    }
    return { name: addressString, email: addressString };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading messages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-red-600">Error loading messages: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Thread Conversation</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-[600px]">
        {/* Messages Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 border-r border-gray-200">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No messages found in this thread.</p>
            </div>
          ) : (
            messages.map((message) => {
              const isCustomer = message.customer_id !== null;
              const fromInfo = parseEmailAddress(message.from_address);

              return (
                <div
                  key={message.message_id}
                  className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      isCustomer
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {/* Message Header */}
                    <div className={`flex items-center gap-2 mb-2 ${isCustomer ? 'text-gray-600' : 'text-blue-100'}`}>
                      {isCustomer ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">
                        {isCustomer ? fromInfo.name || fromInfo.email : 'You'}
                      </span>
                      <span className="text-xs opacity-75">
                        {formatDate(message.sent_date)}
                      </span>
                    </div>

                    {/* Message Body */}
                    <div
                      className={`text-sm ${isCustomer ? 'text-gray-900' : 'text-white'}`}
                      dangerouslySetInnerHTML={{
                        __html: message.body_html || message.body_text || message.snippet || 'No content'
                      }}
                    />

                    {/* Snippet fallback if no body */}
                    {!message.body_html && !message.body_text && message.snippet && (
                      <p className="text-sm mt-2 opacity-90">{message.snippet}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary Sidebar */}
        <div className="w-full lg:w-80 p-4 bg-gray-50 overflow-y-auto">
          <h4 className="font-semibold text-gray-900 mb-4">Thread Summary</h4>
          
          {threadSummary && 'error' in threadSummary ? (
            <div className="text-sm text-red-600">
              <p>Error generating summary: {(threadSummary as { error: string }).error}</p>
            </div>
          ) : threadSummary ? (
            <div className="space-y-4 text-sm">
              {threadSummary.problem_statement && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Problem Statement</h5>
                  <p className="text-gray-600">{threadSummary.problem_statement}</p>
                </div>
              )}

              {threadSummary.key_participants && Array.isArray(threadSummary.key_participants) && threadSummary.key_participants.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Key Participants</h5>
                  <ul className="list-disc list-inside text-gray-600">
                    {threadSummary.key_participants.map((participant: string, idx: number) => (
                      <li key={idx}>{participant}</li>
                    ))}
                  </ul>
                </div>
              )}

              {threadSummary.timeline_summary && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Timeline</h5>
                  <p className="text-gray-600">{threadSummary.timeline_summary}</p>
                </div>
              )}

              {threadSummary.resolution_status && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Resolution Status</h5>
                  <p className="text-gray-600">{threadSummary.resolution_status}</p>
                </div>
              )}

              {threadSummary.customer_sentiment && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Customer Sentiment</h5>
                  <p className="text-gray-600">{threadSummary.customer_sentiment}</p>
                </div>
              )}

              {threadSummary.csm_next_step && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-1">Next Step</h5>
                  <p className="text-gray-600">{threadSummary.csm_next_step}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <p>No summary available for this thread.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

