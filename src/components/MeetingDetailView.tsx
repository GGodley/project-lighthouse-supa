'use client';

import React, { useState, useEffect } from 'react';
import { Phone, X, Calendar, Users, Clock, CheckCircle, User } from 'lucide-react';
import { Json } from '@/types/database';
import { useSupabase } from '@/components/SupabaseProvider';
import { apiFetchJson } from '@/lib/api-client';

interface NextStep {
  id: string;
  text: string;
  status: 'todo' | 'in_progress' | 'done';
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
    transcript: string | null;
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
        // Query next_steps linked to this meeting
        // Get the meeting's meeting_uuid_id (UUID) to use for matching
        const { data: meetingData } = await supabase
          .from('meetings')
          .select('meeting_uuid_id')
          .eq('google_event_id', meeting.google_event_id)
          .single();

        // Query next_steps linked to this meeting via meeting_uuid_id
        let query = supabase
          .from('next_steps')
          .select('step_id, description, status, owner, due_date, thread_id, meeting_id, created_at')
          .is('thread_id', null); // Only meeting-linked next steps

        // If we have meeting_uuid_id, match it to next_steps.meeting_id
        if (meetingData?.meeting_uuid_id) {
          query = query.eq('meeting_id', meetingData.meeting_uuid_id);
        } else {
          // If no meeting_uuid_id found, return empty results
          query = query.is('meeting_id', null);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching next steps:', error);
          setNextSteps([]);
        } else {
          // Map database schema to component interface
          type NextStepRow = {
            step_id: string;
            description: string;
            status: 'todo' | 'in_progress' | 'done';
            owner: string | null;
            due_date: string | null;
            thread_id: string | null;
            meeting_id: string | null;
            created_at: string | null;
          };
          setNextSteps((data || []).map((step: NextStepRow) => ({
            id: step.step_id,
            text: step.description,
            status: step.status,
            owner: step.owner,
            due_date: step.due_date,
            source_type: step.meeting_id ? 'meeting' : 'thread' as 'thread' | 'meeting',
            created_at: step.created_at || '',
          })));
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
      // Toggle between 'todo' and 'done' (if in_progress, toggle to done)
      const newStatus = step.status === 'done' ? 'todo' : 'done';
      
      const updated = await apiFetchJson<NextStep>(`/api/companies/${companyId}/next-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
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
          s.id === step.id ? { ...s, status: step.status } : s
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-white flex-shrink-0">
        <h3 className="text-lg font-semibold text-gray-900">{meeting.title || 'Meeting'}</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Panel - Transcript (primary content, like email body) */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-gray-200" style={{ minWidth: '60%' }}>
          {meeting.transcript && meeting.transcript.trim().length > 0 ? (
            <div className="space-y-0">
              {meeting.transcript.split('\n\n').map((segment, index) => {
                // Parse transcript segments: "Speaker Name: text"
                const match = segment.match(/^([^:]+):\s*(.+)$/s);
                if (match) {
                  const speaker = match[1].trim();
                  const text = match[2].trim();
                  return (
                    <div
                      key={index}
                      className={`border-b border-gray-200 pb-4 mb-4 last:border-b-0 last:mb-0 ${
                        index === 0 ? 'glass-card -mx-6 px-6 pt-4 rounded-lg' : ''
                      }`}
                    >
                      {/* Speaker Header */}
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-semibold text-gray-900">{speaker}</span>
                        </div>
                      </div>

                      {/* Transcript Text - Email Body Style */}
                      <div className="ml-6">
                        <div className="text-sm text-black dark:text-gray-100 whitespace-pre-wrap" style={{ color: '#000000' }}>
                          {text}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Fallback for segments that don't match the pattern
                  return (
                    <div
                      key={index}
                      className={`border-b border-gray-200 pb-4 mb-4 last:border-b-0 last:mb-0 ${
                        index === 0 ? 'glass-card -mx-6 px-6 pt-4 rounded-lg' : ''
                      }`}
                    >
                      <div className="ml-6">
                        <div className="text-sm text-black dark:text-gray-100 whitespace-pre-wrap" style={{ color: '#000000' }}>
                          {segment.trim()}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2 font-medium">No transcript available yet.</p>
              <p className="text-xs text-gray-500">
                Once the transcription job finishes, the full call transcript will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Right Panel - Summary & Details Sidebar (mirrors thread summary sidebar) */}
        <div className="w-full lg:w-96 p-6 bg-gray-50 overflow-y-auto border-l border-gray-200 glass-card thread-summary-sidebar">
          <div className="space-y-4">
            {/* Summary */}
            {meeting.summary && meeting.summary.trim().length > 0 && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#1a1a1a' }}>
                <h4 className="font-semibold text-black mb-2">Summary</h4>
                <p className="text-sm text-black dark:text-gray-300 whitespace-pre-wrap" style={{ color: '#1a1a1a' }}>
                  {meeting.summary}
                </p>
              </div>
            )}

            {/* Customer Sentiment */}
            {meeting.customer_sentiment && meeting.customer_sentiment.trim().length > 0 && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#1a1a1a' }}>
                <h4 className="font-semibold text-black mb-2">Customer Sentiment</h4>
                <span
                  className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${getSentimentColor(
                    meeting.customer_sentiment
                  )}`}
                >
                  {meeting.customer_sentiment}
                </span>
              </div>
            )}

            {/* Date & Time */}
            <div className="glass-card rounded-xl p-4" style={{ color: '#1a1a1a' }}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-black dark:text-gray-400" />
                <h4 className="font-semibold text-black">Date & Time</h4>
              </div>
              <div className="space-y-2 text-sm" style={{ color: '#1a1a1a' }}>
                <div>
                  <span className="font-medium text-black dark:text-gray-300" style={{ color: '#1a1a1a' }}>
                    Date:{' '}
                  </span>
                  <span className="text-black dark:text-gray-400" style={{ color: '#1a1a1a' }}>
                    {formatDate(meeting.start_time)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-medium text-black dark:text-gray-300" style={{ color: '#1a1a1a' }}>
                      Start:{' '}
                    </span>
                    <span className="text-black dark:text-gray-400" style={{ color: '#1a1a1a' }}>
                      {formatTime(meeting.start_time)}
                    </span>
                  </div>
                  {meeting.end_time && (
                    <div>
                      <span className="font-medium text-black dark:text-gray-300" style={{ color: '#1a1a1a' }}>
                        End:{' '}
                      </span>
                      <span className="text-black dark:text-gray-400" style={{ color: '#1a1a1a' }}>
                        {formatTime(meeting.end_time)}
                      </span>
                    </div>
                  )}
                </div>
                {meeting.start_time && meeting.end_time && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-4 w-4 text-black dark:text-gray-400" style={{ color: '#1a1a1a' }} />
                    <span className="text-xs text-black dark:text-gray-400" style={{ color: '#1a1a1a' }}>
                      Duration:{' '}
                      {Math.round((new Date(meeting.end_time).getTime() - new Date(meeting.start_time).getTime()) / 60000)}{' '}
                      minutes
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Attendees */}
            {attendees.length > 0 && (
              <div className="glass-card rounded-xl p-4" style={{ color: '#1a1a1a' }}>
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

            {/* Next Steps */}
            <div className="glass-card rounded-xl p-4" style={{ color: '#1a1a1a' }}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-black dark:text-gray-400" />
                <h4 className="font-semibold text-black">Next Steps</h4>
              </div>
              {loadingNextSteps ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : nextSteps.length > 0 ? (
                <div className="space-y-3">
                  {nextSteps.map((step) => (
                    <div key={step.id} className={`glass-bar-row p-3 ${step.status === 'done' ? 'opacity-75' : ''}`}>
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleNextStep(step)}
                          disabled={updatingStepId === step.id}
                          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                            step.status === 'done'
                              ? 'bg-green-600 border-green-600'
                              : 'border-gray-300 hover:border-blue-600'
                          } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {step.status === 'done' && <CheckCircle className="w-4 h-4 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm text-black font-medium mb-2 ${
                              step.status === 'done' ? 'line-through' : ''
                            }`}
                            style={{ color: '#1a1a1a' }}
                          >
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
                <p className="text-sm text-black dark:text-gray-400 text-center py-2">
                  No next steps for this meeting
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

