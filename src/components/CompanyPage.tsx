import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Phone, Mail, AlertCircle, CheckCircle, List, Clock, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import ThreadConversationView from './ThreadConversationView';
import MeetingDetailView from './MeetingDetailView';
import { getThreadById } from '@/lib/threads/queries';
import { LLMSummary } from '@/lib/types/threads';
import HealthScoreBar from '@/components/ui/HealthScoreBar';
import { getSentimentFromHealthScore } from '@/lib/utils';
import { apiFetchJson } from '@/lib/api-client';
import { Database } from '@/types/database';

type Meeting = Database['public']['Tables']['meetings']['Row'];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CompanyPageProps {
  companyId: string;
}

interface CompanyDetails {
  company_id: string;
  company_name: string | null;
  domain_name: string;
  health_score: number | null;
  overall_sentiment: string | null;
  status: string | null;
  mrr: number | null;
  renewal_date: string | null;
  last_interaction_at: string | null;
  created_at: string | null;
}

interface ProductFeedback {
  id: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  source: string | null;
  source_id: string | null;
  source_type: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Interaction {
  interaction_type: 'email' | 'meeting';
  interaction_date: string;
  id: string;
  title: string;
  summary: string;
  sentiment: string;
}

interface NextStep {
  id: string;
  text: string;
  completed: boolean;
  owner: string | null;
  due_date: string | null;
  source_type: 'thread' | 'meeting';
  created_at: string;
}

interface CompanyData {
  company_details: CompanyDetails;
  product_feedback: ProductFeedback[];
  interaction_timeline: Interaction[];
  next_steps: NextStep[];
}

const CompanyPage: React.FC<CompanyPageProps> = ({ companyId }) => {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'Overview' | 'Interaction Timeline'>('Overview');
  
  // Thread modal state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadSummary, setSelectedThreadSummary] = useState<LLMSummary | { error: string } | null>(null);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);
  
  // Meeting modal state
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState<boolean>(false);
  
  // Next Steps state management
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [completedExpanded, setCompletedExpanded] = useState<boolean>(false);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);

  // Toggle function for next steps - calls API
  const toggleNextStep = async (step: NextStep) => {
    setUpdatingStepId(step.id);
    try {
      // Use the centralized API client for automatic 401 handling
      const updated = await apiFetchJson<NextStep>(`/api/companies/${companyId}/next-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !step.completed }),
      });
      
      // Update local state
      setNextSteps(
        nextSteps.map(s => 
          s.id === step.id ? updated : s
        )
      );
    } catch (err) {
      console.error('Error updating next step:', err);
      // Revert on error
      setNextSteps(
        nextSteps.map(s => 
          s.id === step.id ? { ...s, completed: step.completed } : s
        )
      );
    } finally {
      setUpdatingStepId(null);
    }
  };

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!companyId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const functionName = `get-company-page-details?company_id=${companyId}`;
        const { data, error } = await supabase.functions.invoke(functionName, {
          method: 'GET',
        });

        if (error) {
          throw error;
        }

        setCompanyData(data);
        
        // Initialize next steps state
        if (data && data.next_steps) {
          setNextSteps(data.next_steps);
        }
      } catch (err) {
        console.error('Error fetching company data:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch company data';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [companyId]);

  const getSentimentColor = (sentiment: string | null): string => {
    switch (sentiment?.toLowerCase()) {
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

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Error Loading Company</h2>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Company Not Found</h2>
          <p className="text-slate-600">The requested company could not be found.</p>
        </div>
      </div>
    );
  }

  const { company_details, product_feedback, interaction_timeline } = companyData;

  // Sentiment chip styles for company overall sentiment
  const sentimentStyles: Record<string, string> = {
    'Healthy': 'bg-green-100 text-green-800',
    'At Risk': 'bg-red-100 text-red-800',
    'Neutral': 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">{company_details.company_name}</h1>
              <p className="text-slate-600 mt-1">Domain: {company_details.domain_name}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-4 text-sm">
                {/* Status pill */}
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                  {company_details.status || 'Active'}
                </span>

                {/* Overall Sentiment pill */}
                {company_details.overall_sentiment && (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sentimentStyles[company_details.overall_sentiment] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {company_details.overall_sentiment}
                  </span>
                )}

                {/* Health score */}
                {company_details.health_score !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 text-sm">Health Score:</span>
                    <HealthScoreBar score={company_details.health_score} showLabel={true} />
                  </div>
                )}

                {/* MRR */}
                <span className="text-slate-600">
                  MRR: ${company_details.mrr ? company_details.mrr.toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm p-1 mb-6">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveView('Overview')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeView === 'Overview'
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveView('Interaction Timeline')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeView === 'Interaction Timeline'
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Interaction Timeline
            </button>
          </div>
        </div>

        {/* Overview View */}
        {activeView === 'Overview' && (
          <div className="space-y-6">
            {/* Overview Card */}
            <div className="bg-white rounded-lg shadow-md">
              {/* Card Header */}
              <div className="bg-gray-100 px-4 py-3 border-b">
                <div className="flex items-center">
                  <List className="h-5 w-5 text-gray-500" />
                  <h3 className="text-lg font-semibold ml-2">Overview</h3>
                </div>
              </div>
              
              {/* Card Content - 2 Column Layout */}
              <div className="flex flex-col md:flex-row">
                {/* Left Column - Recent Interactions */}
                <div className="w-full md:w-2/3 p-4">
                  <h3 className="font-semibold mb-3">Recent Interactions</h3>
                  <div className="space-y-3">
                    {interaction_timeline.slice(0, 3).map((interaction, index) => (
                      <div key={index} className="flex py-3">
                        {/* Left Side - Type & Date */}
                        <div className="w-1/4">
                          <div className={`font-semibold ${
                            interaction.interaction_type === 'meeting' 
                              ? 'text-indigo-600' 
                              : 'text-pink-600'
                          }`}>
                            {interaction.interaction_type === 'meeting' ? 'Meeting' : 'Email'}
                          </div>
                          <div className="text-sm text-gray-500">{formatDate(interaction.interaction_date)}</div>
                        </div>
                        {/* Right Side - Description */}
                        <div className="w-3/4">
                          <p className="text-gray-700">{interaction.title}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column - Overall Sentiment */}
                <div className="w-full md:w-1/3 p-4">
                  <h3 className="font-semibold mb-3">Overall Sentiment</h3>
                  {(() => {
                    const sentimentData = getSentimentFromHealthScore(company_details.health_score);
                    if (sentimentData) {
                      const IconComponent = sentimentData.icon;
                      return (
                        <div className={`border rounded-lg p-4 ${sentimentData.colors.bg} ${sentimentData.colors.border}`}>
                          <div className="flex items-center mb-2">
                            <IconComponent className={`h-5 w-5 ${sentimentData.colors.icon}`} />
                            <strong className={`ml-2 ${sentimentData.colors.text}`}>
                              {sentimentData.category}
                            </strong>
                          </div>
                          <p className="text-sm text-gray-700">
                            {sentimentData.message}
                          </p>
                        </div>
                      );
                    } else {
                        return (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <p className="text-sm text-gray-500">No sentiment data available</p>
                          </div>
                        );
                      }
                  })()}
                </div>
              </div>
            </div>

            {/* Product Feedback */}
            {product_feedback && product_feedback.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Product Feedback</h2>
                <div className="space-y-4">
                  {product_feedback.map((feedback, index) => {
                    // Determine source link URL
                    const getSourceLink = () => {
                      if (!feedback.source_id || !feedback.source_type) return null;
                      
                      // For threads, we need company_id in the path
                      if (feedback.source_type === 'thread' && feedback.company_id) {
                        return `/dashboard/customer-threads/${feedback.company_id}?thread=${feedback.source_id}`;
                      }
                      
                      // For meetings, use the meeting detail route
                      if (feedback.source_type === 'meeting') {
                        return `/dashboard/meetings/${feedback.source_id}`;
                      }
                      
                      // For emails (legacy), try to find if it's a thread or use company page
                      if (feedback.source_type === 'email') {
                        // If we have company_id, link to company page
                        if (feedback.company_id) {
                          return `/dashboard/customer-threads/${feedback.company_id}`;
                        }
                        return null;
                      }
                      
                      return null;
                    };
                    
                    const sourceLink = getSourceLink();
                    const sourceLabel = feedback.source 
                      ? feedback.source.charAt(0).toUpperCase() + feedback.source.slice(1)
                      : 'Unknown';
                    
                    return (
                      <div key={feedback.id || index} className="p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-800">{feedback.title}</h3>
                              {feedback.status && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  feedback.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                  feedback.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                  feedback.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {feedback.status.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            {feedback.source && (
                              <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                                <span>From {sourceLabel}</span>
                                {sourceLink && (
                                  <Link 
                                    href={sourceLink}
                                    className="text-blue-600 hover:text-blue-800 underline"
                                  >
                                    View Source →
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          feedback.urgency === 'High' ? 'bg-red-100 text-red-800' :
                          feedback.urgency === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {feedback.urgency}
                        </span>
                      </div>
                      <p className="text-slate-600">{feedback.description}</p>
                        {feedback.created_at && (
                          <p className="text-xs text-slate-400 mt-2">
                            Created {new Date(feedback.created_at).toLocaleDateString()}
                          </p>
                        )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next Steps - Enhanced Design */}
            {nextSteps && nextSteps.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                {/* Main Section Header */}
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-6 w-6 text-gray-500" />
                  <h3 className="text-xl font-semibold text-gray-900">Next Steps</h3>
                </div>
                
                {/* Active Next Steps */}
                {nextSteps.filter(s => !s.completed).length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-5 w-5 text-gray-500" />
                      <h4 className="font-semibold">Next Steps</h4>
                    </div>
                    
                    <ul className="space-y-3">
                      {nextSteps.filter(s => !s.completed).map((step) => (
                        <li key={step.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <button
                            onClick={() => toggleNextStep(step)}
                            disabled={updatingStepId === step.id}
                            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                              step.completed
                                ? 'bg-indigo-600 border-indigo-600'
                                : 'border-gray-300 hover:border-indigo-600'
                            } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {step.completed && <CheckCircle className="w-3 h-3 text-white" />}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700">{step.text}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {step.owner && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Owner: {step.owner}
                                </span>
                              )}
                              {step.due_date && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  Due: {new Date(step.due_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Completed Next Steps - Collapsible */}
                {nextSteps.filter(s => s.completed).length > 0 && (
                  <div>
                    <button
                      onClick={() => setCompletedExpanded(!completedExpanded)}
                      className="flex items-center gap-2 mb-3 w-full text-left"
                    >
                      <Users className="h-5 w-5 text-gray-500" />
                      <h4 className="font-semibold">Completed Next Steps</h4>
                      <span className="ml-auto text-sm text-gray-500">
                        ({nextSteps.filter(s => s.completed).length})
                        {completedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    </button>
                    
                    {completedExpanded && (
                      <div className="max-h-96 overflow-y-auto">
                        <ul className="space-y-3">
                          {nextSteps.filter(s => s.completed).map((step) => (
                            <li key={step.id} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                              <button
                                onClick={() => toggleNextStep(step)}
                                disabled={updatingStepId === step.id}
                                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                                  step.completed
                                    ? 'bg-green-600 border-green-600'
                                    : 'border-gray-300 hover:border-indigo-600'
                                } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {step.completed && <CheckCircle className="w-3 h-3 text-white" />}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-700 line-through">{step.text}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {step.owner && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Owner: {step.owner}
                                    </span>
                                  )}
                                  {step.due_date && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                      Due: {new Date(step.due_date).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Interaction Timeline View */}
        {activeView === 'Interaction Timeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Side - Interaction Timeline List */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Interaction Timeline</h2>
              <p className="text-sm text-gray-600 mb-6">Complete history of calls and emails with detailed summaries.</p>
              
              <div className="space-y-4">
                {interaction_timeline && interaction_timeline.length > 0 ? (
                  interaction_timeline.map((interaction, index) => {
                    const isThread = interaction.interaction_type === 'email' && interaction.id;
                    const isMeeting = interaction.interaction_type === 'meeting' && interaction.id;
                    const isClickable = isThread || isMeeting;
                    const isSelected = (isThread && selectedThreadId === interaction.id) || (isMeeting && selectedMeetingId === interaction.id);
                    
                    return (
                      <div 
                        key={index} 
                        className={`glass-bar-row p-5 ${isClickable ? 'cursor-pointer hover:shadow-md transition-all hover:bg-white/90' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}`}
                        onClick={async () => {
                          if (isThread && interaction.id) {
                            setLoadingThread(true);
                            setSelectedThreadId(interaction.id);
                            setSelectedMeetingId(null);
                            setSelectedMeeting(null);
                            
                            try {
                              // Fetch the thread to get its summary
                              const { data: thread, error: threadError } = await getThreadById(supabase, interaction.id);
                              
                              if (threadError || !thread) {
                                setSelectedThreadSummary({ error: threadError?.message || 'Thread not found' });
                              } else {
                                setSelectedThreadSummary(thread.llm_summary);
                              }
                            } catch (err) {
                              console.error('Error fetching thread:', err);
                              setSelectedThreadSummary({ error: 'Failed to load thread' });
                            } finally {
                              setLoadingThread(false);
                            }
                          } else if (isMeeting && interaction.id) {
                            setLoadingMeeting(true);
                            setSelectedMeetingId(interaction.id);
                            setSelectedThreadId(null);
                            setSelectedThreadSummary(null);
                            
                            try {
                              // Fetch the meeting details
                              const { data: meeting, error: meetingError } = await supabase
                                .from('meetings')
                                .select('*')
                                .eq('google_event_id', interaction.id)
                                .single();
                              
                              if (meetingError || !meeting) {
                                console.error('Error fetching meeting:', meetingError);
                                setSelectedMeeting(null);
                              } else {
                                setSelectedMeeting(meeting);
                              }
                            } catch (err) {
                              console.error('Error fetching meeting:', err);
                              setSelectedMeeting(null);
                            } finally {
                              setLoadingMeeting(false);
                            }
                          }
                        }}
                      >
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`flex-shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center ${
                            interaction.interaction_type === 'meeting' 
                              ? 'bg-pink-50 border-pink-200' 
                              : 'bg-blue-50 border-blue-200'
                          }`}>
                            {interaction.interaction_type === 'meeting' ? (
                              <Phone className="w-6 h-6 text-pink-600" />
                            ) : (
                              <Mail className="w-6 h-6 text-blue-600" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 truncate text-base">
                                {interaction.title || 'No Title'}
                              </h3>
                              <span className="text-sm text-gray-600 flex-shrink-0 ml-2 font-medium">
                                {formatDate(interaction.interaction_date)}
                              </span>
                            </div>

                            {/* Type and Sentiment */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-gray-700">
                                {interaction.interaction_type === 'meeting' ? 'Meeting' : 'Email Thread'}
                              </span>
                              {interaction.sentiment && (
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getSentimentColor(interaction.sentiment)}`}>
                                  {interaction.sentiment}
                                </span>
                              )}
                            </div>

                            {/* Summary */}
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                              {interaction.summary || 'No summary available'}
                            </p>

                            {/* Click hint */}
                            {isClickable && (
                              <span className="text-xs text-blue-600">
                                {isThread ? 'Click to view full thread conversation →' : 'Click to view meeting details →'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No interactions found for this company.</p>
                    {!interaction_timeline && (
                      <p className="text-xs mt-2 text-gray-400">interaction_timeline is null or undefined</p>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      {/* Thread Conversation Modal Overlay */}
      {selectedThreadId && (
        <div 
          className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          style={{ marginLeft: '256px' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedThreadId(null);
              setSelectedThreadSummary(null);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {loadingThread ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="ml-4 text-gray-600">Loading thread...</p>
              </div>
            ) : (
              <ThreadConversationView
                threadId={selectedThreadId}
                threadSummary={selectedThreadSummary}
                onClose={() => {
                  setSelectedThreadId(null);
                  setSelectedThreadSummary(null);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Meeting Detail Modal Overlay */}
      {selectedMeetingId && (
        <div 
          className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          style={{ marginLeft: '256px' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedMeetingId(null);
              setSelectedMeeting(null);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {loadingMeeting ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="ml-4 text-gray-600">Loading meeting...</p>
              </div>
            ) : selectedMeeting ? (
              <MeetingDetailView
                meeting={selectedMeeting}
                companyId={companyId}
                onClose={() => {
                  setSelectedMeetingId(null);
                  setSelectedMeeting(null);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-red-600">
                <p>Failed to load meeting details</p>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default CompanyPage;
