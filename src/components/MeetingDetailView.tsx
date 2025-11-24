'use client';

import React, { useState, useEffect } from 'react';
import { Phone, X, Calendar, Users, Clock, CheckCircle } from 'lucide-react';
import { Json } from '@/types/database';
import { useSupabase } from '@/components/SupabaseProvider';
import { apiFetchJson } from '@/lib/api-client';

interface NextStep {
  id: string;
  text: string;
  completed: boolean;
  owner: string | null;
  due_date: string | null;
  source_type: 'thread' | 'meeting';
  created_at: string;
}

interface MeetingDetailViewProps {
  meeting: {
    google_event_id: string;
    title: string | null;
    summary: string | null;
    start_time: string | null;
    end_time: string | null;
    attendees: Json | null;
    next_steps: Json | null;
    customer_sentiment: string | null;
  };
  companyId: string;
  onClose: () => void;
}

export default function MeetingDetailView({ meeting, companyId, onClose }: MeetingDetailViewProps) {
  const supabase = useSupabase();
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);
  const [loadingNextSteps, setLoadingNextSteps] = useState<boolean>(true);

  // Fetch next steps from database linked to this meeting
  useEffect(() => {
    const fetchNextSteps = async () => {
      if (!meeting.google_event_id) {
        setLoadingNextSteps(false);
        return;
      }

      try {
        // Type assertion needed because next_steps table is not in Database types
        // Using PostgrestQueryBuilder type to bypass type checking
        const queryBuilder = supabase.from('next_steps' as never);
        const { data, error } = await queryBuilder
          .select('*')
          .eq('company_id', companyId)
          .eq('source_type', 'meeting')
          .eq('source_id', meeting.google_event_id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching next steps:', error);
          setNextSteps([]);
        } else {
          setNextSteps((data as NextStep[]) || []);
        }
      } catch (err) {
        console.error('Error fetching next steps:', err);
        setNextSteps([]);
      } finally {
        setLoadingNextSteps(false);
      }
    };

    fetchNextSteps();
  }, [meeting.google_event_id, companyId, supabase]);

  // Toggle function for next steps
  const toggleNextStep = async (step: NextStep) => {
    setUpdatingStepId(step.id);
    try {
      const updated = await apiFetchJson<NextStep>(`/api/companies/${companyId}/next-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !step.completed }),
      });

      setNextSteps(
        nextSteps.map(s =>
          s.id === step.id ? updated : s
        )
      );
    } catch (err) {
      console.error('Error updating next step:', err);
      setNextSteps(
        nextSteps.map(s =>
          s.id === step.id ? { ...s, completed: step.completed } : s
        )
      );
    } finally {
      setUpdatingStepId(null);
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

  const attendees = parseAttendees(meeting.attendees);

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
    <div className="glass-card rounded-lg" style={{ color: '#000000' }}>
      {/* Header */}
      <div className="border-b border-white/20 dark:border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center">
            <Phone className="w-5 h-5 text-pink-600" />
          </div>
          <h3 className="text-lg font-semibold text-black">{meeting.title || 'Meeting'}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-black hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-[600px]">
        {/* Main Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-white/20 dark:border-white/10" style={{ color: '#000000' }}>
          <div className="space-y-6">
            {/* Date and Time */}
            <div className="glass-card rounded-xl p-4" style={{ color: '#000000' }}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-black dark:text-gray-400" />
                <h4 className="font-semibold text-black">Date & Time</h4>
              </div>
              <div className="space-y-2 text-sm" style={{ color: '#000000' }}>
                <div>
                  <span className="font-medium text-black dark:text-gray-300" style={{ color: '#000000' }}>Date: </span>
                  <span className="text-black dark:text-gray-400" style={{ color: '#000000' }}>{formatDate(meeting.start_time)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-medium text-black dark:text-gray-300" style={{ color: '#000000' }}>Start: </span>
                    <span className="text-black dark:text-gray-400" style={{ color: '#000000' }}>{formatTime(meeting.start_time)}</span>
                  </div>
                  {meeting.end_time && (
                    <div>
                      <span className="font-medium text-black dark:text-gray-300" style={{ color: '#000000' }}>End: </span>
                      <span className="text-black dark:text-gray-400" style={{ color: '#000000' }}>{formatTime(meeting.end_time)}</span>
                    </div>
                  )}
                </div>
                {meeting.start_time && meeting.end_time && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-4 w-4 text-black dark:text-gray-400" style={{ color: '#000000' }} />
                    <span className="text-xs text-black dark:text-gray-400" style={{ color: '#000000' }}>
                      Duration: {Math.round((new Date(meeting.end_time).getTime() - new Date(meeting.start_time).getTime()) / 60000)} minutes
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Attendees */}
            {attendees.length > 0 && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#000000' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-5 w-5 text-black dark:text-gray-400" />
                  <h4 className="font-semibold text-black">Attendees</h4>
                </div>
                <ul className="space-y-2">
                  {attendees.map((attendee, index) => (
                    <li key={index} className="text-sm text-black dark:text-gray-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      {attendee}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary */}
            {meeting.summary && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#000000' }}>
                <h4 className="font-semibold text-black mb-3">Summary</h4>
                <p className="text-sm text-black dark:text-gray-300 whitespace-pre-wrap" style={{ color: '#000000 !important' } as React.CSSProperties}>
                  {meeting.summary}
                </p>
              </div>
            )}

            {/* Sentiment */}
            {meeting.customer_sentiment && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#000000' }}>
                <h4 className="font-semibold text-black mb-3">Customer Sentiment</h4>
                <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${getSentimentColor(meeting.customer_sentiment)}`}>
                  {meeting.customer_sentiment}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Next Steps Sidebar */}
        <div className="w-full lg:w-80 p-4 glass-card overflow-y-auto" style={{ color: '#000000' }}>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-black dark:text-gray-400" />
            <h4 className="font-semibold text-black">Next Steps</h4>
          </div>
          {loadingNextSteps ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : nextSteps.length > 0 ? (
            <div className="space-y-3">
              {nextSteps.map((step) => (
                <div key={step.id} className={`glass-bar-row p-3 ${step.completed ? 'opacity-75' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleNextStep(step)}
                      disabled={updatingStepId === step.id}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                        step.completed
                          ? 'bg-green-600 border-green-600'
                          : 'border-gray-300 hover:border-blue-600'
                      } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {step.completed && <CheckCircle className="w-4 h-4 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm text-black font-medium mb-2 ${step.completed ? 'line-through' : ''}`} style={{ color: '#000000' }}>
                        {step.text}
                      </p>
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-black dark:text-gray-400 text-center py-4">No next steps for this meeting</p>
          )}
        </div>
      </div>
    </div>
  );
}

