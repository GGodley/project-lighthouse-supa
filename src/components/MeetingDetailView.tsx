'use client';

import React from 'react';
import { Phone, X, Calendar, Users, Clock, CheckCircle } from 'lucide-react';
import { Json } from '@/types/database';

interface MeetingDetailViewProps {
  meeting: {
    google_event_id: string;
    title: string | null;
    summary: string | null;
    start_time: string | null;
    end_time: string | null;
    attendees: any;
    next_steps: any;
    customer_sentiment: string | null;
  };
  onClose: () => void;
}

export default function MeetingDetailView({ meeting, onClose }: MeetingDetailViewProps) {
  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const formatTime = (dateString: string | null): string => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid time';
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  // Parse attendees - can be array of strings (emails) or array of objects
  const parseAttendees = (attendees: Json | null): string[] => {
    if (!attendees) return [];
    if (Array.isArray(attendees)) {
      return attendees.map((attendee: Json): string => {
        if (typeof attendee === 'string') {
          return attendee;
        } else if (attendee && typeof attendee === 'object' && attendee !== null && !Array.isArray(attendee)) {
          const attendeeObj = attendee as Record<string, Json | undefined>;
          const email = typeof attendeeObj.email === 'string' ? attendeeObj.email : undefined;
          const name = typeof attendeeObj.name === 'string' ? attendeeObj.name : undefined;
          return email || name || JSON.stringify(attendee);
        }
        return String(attendee);
      });
    }
    return [];
  };

  // Parse next steps - can be array or string
  // Note: Database type shows next_steps as string | null, but it can be JSONB in practice
  const parseNextSteps = (nextSteps: Json | string | null): Array<{ text: string; owner: string | null; due_date: string | null }> => {
    if (!nextSteps) return [];
    if (Array.isArray(nextSteps)) {
      return nextSteps
        .filter((step: Json): step is Record<string, Json | undefined> => 
          step !== null && typeof step === 'object' && !Array.isArray(step)
        )
        .map((step: Record<string, Json | undefined>) => ({
          text: typeof step.text === 'string' ? step.text : (typeof step === 'string' ? step : ''),
          owner: typeof step.owner === 'string' ? step.owner : null,
          due_date: typeof step.due_date === 'string' ? step.due_date : null
        }))
        .filter(step => step.text !== '');
    } else if (typeof nextSteps === 'string') {
      return [{ text: nextSteps.trim(), owner: null, due_date: null }];
    }
    return [];
  };

  const attendees = parseAttendees(meeting.attendees);
  const nextSteps = parseNextSteps(meeting.next_steps);

  const getSentimentColor = (sentiment: string | null): string => {
    if (!sentiment) return 'bg-gray-50 text-gray-700 border border-gray-200';
    switch (sentiment.toLowerCase()) {
      case 'positive':
      case 'very positive':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'neutral':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'frustrated':
      case 'negative':
      case 'very negative':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  return (
    <div className="glass-card rounded-lg">
      {/* Header */}
      <div className="border-b border-white/20 dark:border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center">
            <Phone className="w-5 h-5 text-pink-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{meeting.title || 'Meeting'}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-[600px]">
        {/* Main Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-white/20 dark:border-white/10">
          <div className="space-y-6">
            {/* Date and Time */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <h4 className="font-semibold text-gray-900">Date & Time</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Date: </span>
                  <span className="text-gray-600 dark:text-gray-400">{formatDate(meeting.start_time)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Start: </span>
                    <span className="text-gray-600 dark:text-gray-400">{formatTime(meeting.start_time)}</span>
                  </div>
                  {meeting.end_time && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">End: </span>
                      <span className="text-gray-600 dark:text-gray-400">{formatTime(meeting.end_time)}</span>
                    </div>
                  )}
                </div>
                {meeting.start_time && meeting.end_time && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-xs text-gray-500">
                      Duration: {Math.round((new Date(meeting.end_time).getTime() - new Date(meeting.start_time).getTime()) / 60000)} minutes
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Attendees */}
            {attendees.length > 0 && (
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  <h4 className="font-semibold text-gray-900">Attendees</h4>
                </div>
                <ul className="space-y-2">
                  {attendees.map((attendee, index) => (
                    <li key={index} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      {attendee}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary */}
            {meeting.summary && (
              <div className="glass-card rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Summary</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {meeting.summary}
                </p>
              </div>
            )}

            {/* Sentiment */}
            {meeting.customer_sentiment && (
              <div className="glass-card rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Customer Sentiment</h4>
                <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${getSentimentColor(meeting.customer_sentiment)}`}>
                  {meeting.customer_sentiment}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Next Steps Sidebar */}
        {nextSteps.length > 0 && (
          <div className="w-full lg:w-80 p-4 glass-card overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <h4 className="font-semibold text-gray-900">Next Steps</h4>
            </div>
            <div className="space-y-3">
              {nextSteps.map((step, index) => (
                <div key={index} className="glass-bar-row p-3">
                  <p className="text-sm text-gray-900 font-medium mb-2">{step.text}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {step.owner && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Owner: {step.owner}
                      </span>
                    )}
                    {step.due_date && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        Due: {new Date(step.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

