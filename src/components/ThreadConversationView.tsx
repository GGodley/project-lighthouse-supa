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
      <div className="glass-card rounded-lg p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading messages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-lg p-8 text-center">
        <p className="text-red-600">Error loading messages: {error}</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-lg">
      {/* Header */}
      <div className="border-b border-white/20 dark:border-white/10 p-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Thread Conversation</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-[600px]">
        {/* Messages Panel - Email Thread Style */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-white/20 dark:border-white/10">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No messages found in this thread.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {messages.map((message, index) => {
                const isCustomer = message.customer_id !== null;
                const fromInfo = parseEmailAddress(message.from_address);
                const toAddresses = Array.isArray(message.to_addresses) ? message.to_addresses : [];
                const ccAddresses = Array.isArray(message.cc_addresses) ? message.cc_addresses : [];

                return (
                  <div
                    key={message.message_id}
                    className={`border-b border-white/20 dark:border-white/10 pb-4 mb-4 last:border-b-0 last:mb-0 ${
                      index === messages.length - 1 ? 'glass-card -mx-6 px-6 pt-4 rounded-lg' : ''
                    }`}
                  >
                    {/* Email Header - Traditional Email Style */}
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isCustomer ? (
                              <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            ) : (
                              <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            )}
                            <span className="text-sm font-semibold text-gray-900">
                              {isCustomer ? (fromInfo.name || fromInfo.email) : 'You'}
                            </span>
                            {!isCustomer && fromInfo.email && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                &lt;{fromInfo.email}&gt;
                              </span>
                            )}
                          </div>
                          
                          {toAddresses.length > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                              <span className="font-medium">To:</span> {toAddresses.join(', ')}
                            </div>
                          )}
                          
                          {ccAddresses.length > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                              <span className="font-medium">Cc:</span> {ccAddresses.join(', ')}
                            </div>
                          )}
                        </div>
                        
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(message.sent_date)}
                        </span>
                      </div>
                    </div>

                    {/* Message Body - Email Content */}
                    <div className="ml-6">
                      {message.body_html ? (
                        <div
                          className="text-sm text-gray-900 dark:text-gray-100 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: message.body_html
                          }}
                        />
                      ) : message.body_text ? (
                        <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {message.body_text}
                        </div>
                      ) : message.snippet ? (
                        <p className="text-sm text-gray-600 dark:text-gray-300 italic">{message.snippet}</p>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No content available</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Sidebar */}
        <div className="w-full lg:w-80 p-4 glass-card overflow-y-auto">
          <h4 className="font-semibold text-gray-900 mb-4">Thread Summary</h4>
          
          {threadSummary && 'error' in threadSummary ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              <p>Error generating summary: {(threadSummary as { error: string }).error}</p>
            </div>
          ) : threadSummary ? (
            <div className="space-y-4 text-sm">
              {threadSummary.problem_statement && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Problem Statement</h5>
                  <p className="text-gray-600 dark:text-gray-400">{threadSummary.problem_statement}</p>
                </div>
              )}

              {threadSummary.key_participants && Array.isArray(threadSummary.key_participants) && threadSummary.key_participants.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Key Participants</h5>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                    {threadSummary.key_participants.map((participant: string, idx: number) => (
                      <li key={idx}>{participant}</li>
                    ))}
                  </ul>
                </div>
              )}

              {threadSummary.timeline_summary && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Timeline</h5>
                  <p className="text-gray-600 dark:text-gray-400">{threadSummary.timeline_summary}</p>
                </div>
              )}

              {threadSummary.resolution_status && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Resolution Status</h5>
                  <p className="text-gray-600 dark:text-gray-400">{threadSummary.resolution_status}</p>
                </div>
              )}

              {threadSummary.customer_sentiment && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Sentiment</h5>
                  <p className="text-gray-600 dark:text-gray-400">{threadSummary.customer_sentiment}</p>
                </div>
              )}

              {threadSummary.csm_next_step && (
                <div>
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Next Step</h5>
                  <p className="text-gray-600 dark:text-gray-400">{threadSummary.csm_next_step}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <p>No summary available for this thread.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

