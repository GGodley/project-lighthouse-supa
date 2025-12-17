'use client';

import React from 'react';
import { Mail, User, X } from 'lucide-react';
import { useThreadMessages } from '@/hooks/useThreadMessages';
import { LLMSummary, NextStep } from '@/lib/types/threads';

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-white flex-shrink-0">
        <h3 className="text-lg font-semibold text-gray-900">Thread Conversation</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Messages Panel - Email Thread Style - Takes up most of the space */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-gray-200" style={{ minWidth: '60%' }}>
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
                      index === 0 ? 'glass-card -mx-6 px-6 pt-4 rounded-lg' : ''
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
                            <div className="text-xs text-gray-900 dark:text-gray-400 ml-6">
                              <span className="font-medium">To:</span> {toAddresses.join(', ')}
                            </div>
                          )}
                          
                          {ccAddresses.length > 0 && (
                            <div className="text-xs text-gray-900 dark:text-gray-400 ml-6">
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
                          className="text-sm text-black dark:text-gray-100 prose prose-sm max-w-none prose-p:text-black prose-p:dark:text-gray-100 prose-strong:text-black prose-strong:dark:text-gray-100 prose-a:text-blue-600 prose-a:dark:text-blue-400 prose-li:text-black prose-li:dark:text-gray-100 prose-ul:text-black prose-ul:dark:text-gray-100 prose-ol:text-black prose-ol:dark:text-gray-100 prose-heading:text-black prose-heading:dark:text-gray-100"
                          style={{ color: '#000000' }}
                          dangerouslySetInnerHTML={{
                            __html: message.body_html
                          }}
                        />
                      ) : message.body_text ? (
                        <div className="text-sm text-black dark:text-gray-100 whitespace-pre-wrap" style={{ color: '#000000' }}>
                          {message.body_text}
                        </div>
                      ) : message.snippet ? (
                        <p className="text-sm text-black dark:text-gray-300 italic" style={{ color: '#000000' }}>{message.snippet}</p>
                      ) : (
                        <p className="text-sm text-black dark:text-gray-500 italic" style={{ color: '#000000' }}>No content available</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Sidebar - Separate bubble element */}
        <div className="thread-summary-sidebar w-full lg:w-96 p-6 bg-gray-50 overflow-y-auto border-l border-gray-200 glass-card">
          <h4 className="font-semibold mb-4 text-lg">Thread Summary</h4>
          
          {threadSummary && 'error' in threadSummary ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              <p>Error generating summary: {(threadSummary as { error: string }).error}</p>
            </div>
          ) : threadSummary ? (
            <div className="space-y-4">
              {/* Problem Statement - show if exists and not empty */}
              {threadSummary.problem_statement && threadSummary.problem_statement.trim() && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Problem Statement</h5>
                  <p className="text-sm">{threadSummary.problem_statement}</p>
                </div>
              )}

              {/* Summary - primary field, show if problem_statement is missing */}
              {(!threadSummary.problem_statement || !threadSummary.problem_statement.trim()) && 
               threadSummary.summary && 
               threadSummary.summary.trim() && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Summary</h5>
                  <p className="text-sm">{threadSummary.summary}</p>
                </div>
              )}

              {/* Timeline Summary - show prominently, prioritize this for main summary */}
              {threadSummary.timeline_summary && threadSummary.timeline_summary.trim() && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">
                    {threadSummary.problem_statement && threadSummary.problem_statement.trim() ? 'Timeline' : 'Summary'}
                  </h5>
                  <p className="text-sm">{threadSummary.timeline_summary}</p>
                </div>
              )}

              {threadSummary.key_participants && Array.isArray(threadSummary.key_participants) && threadSummary.key_participants.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Key Participants</h5>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {threadSummary.key_participants.map((participant: string, idx: number) => (
                      <li key={idx}>{participant}</li>
                    ))}
                  </ul>
                </div>
              )}

              {threadSummary.resolution_status && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Resolution Status</h5>
                  <p className="text-sm">{threadSummary.resolution_status}</p>
                </div>
              )}

              {threadSummary.customer_sentiment && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Customer Sentiment</h5>
                  <p className="text-sm">{threadSummary.customer_sentiment}</p>
                </div>
              )}

              {/* Next Steps - check both next_steps and open_next_steps */}
              {(() => {
                // Combine next_steps and open_next_steps, prioritizing next_steps
                const allNextSteps = [
                  ...(threadSummary.next_steps && Array.isArray(threadSummary.next_steps) ? threadSummary.next_steps : []),
                  ...(threadSummary.open_next_steps && Array.isArray(threadSummary.open_next_steps) ? threadSummary.open_next_steps : [])
                ];
                
                return allNextSteps.length > 0 ? (
                  <div className="glass-card rounded-xl p-4">
                    <h5 className="font-semibold mb-3 text-base">Next Steps</h5>
                    <ul className="space-y-3">
                      {allNextSteps.map((step: NextStep, idx: number) => (
                        <li key={idx} className="text-sm">
                          <div className="flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 mt-1 font-bold">•</span>
                            <div className="flex-1">
                              <p className="text-sm">{step.text}</p>
                              {(step.owner || step.due_date) && (
                                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                  {step.owner && <span>Owner: {step.owner}</span>}
                                  {step.due_date && <span>Due: {new Date(step.due_date).toLocaleDateString()}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}
              
              {threadSummary.csm_next_step && (
                <div className="glass-card rounded-xl p-4">
                  <h5 className="font-semibold mb-2 text-base">Next Step (Legacy)</h5>
                  <p className="text-sm">{threadSummary.csm_next_step}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm">
              <p>No summary available for this thread.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

