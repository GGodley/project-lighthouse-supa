'use client';

import React from 'react';
import { LLMSummary } from '@/lib/types/threads';

interface InteractionSummarySidebarProps {
  summary: LLMSummary | { error: string } | null;
  nextSteps: string[];
  interactionType: 'email' | 'meeting';
}

export default function InteractionSummarySidebar({
  summary,
  nextSteps,
  interactionType
}: InteractionSummarySidebarProps) {
  return (
    <div className="w-full lg:w-80 p-4 bg-gray-50 overflow-y-auto h-full">
      <h4 className="font-semibold text-gray-900 mb-4">
        {interactionType === 'email' ? 'Thread Summary' : 'Meeting Summary'}
      </h4>
      
      {summary && 'error' in summary ? (
        <div className="text-sm text-red-600 mb-4">
          <p>Error generating summary: {summary.error}</p>
        </div>
      ) : summary ? (
        <div className="space-y-4 text-sm mb-6">
          {summary.problem_statement && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Problem Statement</h5>
              <p className="text-gray-600">{summary.problem_statement}</p>
            </div>
          )}

          {summary.key_participants && Array.isArray(summary.key_participants) && summary.key_participants.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Key Participants</h5>
              <ul className="list-disc list-inside text-gray-600">
                {summary.key_participants.map((participant: string, idx: number) => (
                  <li key={idx}>{participant}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.timeline_summary && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Timeline</h5>
              <p className="text-gray-600">{summary.timeline_summary}</p>
            </div>
          )}

          {summary.resolution_status && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Resolution Status</h5>
              <p className="text-gray-600">{summary.resolution_status}</p>
            </div>
          )}

          {summary.customer_sentiment && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Customer Sentiment</h5>
              <p className="text-gray-600">{summary.customer_sentiment}</p>
            </div>
          )}

          {summary.csm_next_step && (
            <div>
              <h5 className="font-medium text-gray-700 mb-1">Next Step</h5>
              <p className="text-gray-600">{summary.csm_next_step}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500 mb-6">
          <p>No summary available for this {interactionType}.</p>
        </div>
      )}

      {/* Next Steps Section */}
      {nextSteps && nextSteps.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h5 className="font-medium text-gray-700 mb-3">Next Steps</h5>
          <ul className="space-y-2">
            {nextSteps.map((step, idx) => (
              <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

