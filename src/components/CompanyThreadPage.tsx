import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, List, Clock, Users, Mail, ArrowLeft, CheckCircle, ChevronDown, ChevronRight, Phone } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useCompanyThreads } from '@/hooks/useCompanyThreads';
import ThreadListView from './ThreadListView';
import ThreadConversationView from './ThreadConversationView';
import HealthScoreBar from '@/components/ui/HealthScoreBar';
import { getSentimentFromHealthScore } from '@/lib/utils';
import { LLMSummary } from '@/lib/types/threads';
import { getThreadById } from '@/lib/threads/queries';

interface CompanyThreadPageProps {
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

interface NextStep {
  id: string;
  text: string;
  completed: boolean;
  owner: string | null;
  due_date: string | null;
  source_type: 'thread' | 'meeting';
  created_at: string;
}

interface Interaction {
  interaction_type: 'email' | 'meeting';
  interaction_date: string;
  id: string;
  title: string;
  summary: string;
  sentiment: string;
}

interface CompanyData {
  company_details: CompanyDetails;
  product_feedback: ProductFeedback[];
  interaction_timeline: Interaction[];
  next_steps: NextStep[];
}

const CompanyThreadPage: React.FC<CompanyThreadPageProps> = ({ companyId }) => {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'Overview' | 'Threads' | 'Interaction Timeline'>('Overview');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadSummary, setSelectedThreadSummary] = useState<LLMSummary | { error: string } | null>(null);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);
  const supabase = useSupabase();
  const searchParams = useSearchParams();

  // Get threads for this company
  const { threads, loading: threadsLoading } = useCompanyThreads(companyId);

  // Next Steps state management
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [activeExpanded, setActiveExpanded] = useState<boolean>(true);
  const [completedExpanded, setCompletedExpanded] = useState<boolean>(false);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);

  // Toggle function for next steps - calls API
  const toggleNextStep = async (step: NextStep) => {
    setUpdatingStepId(step.id);
    try {
      const response = await fetch(`/api/companies/${companyId}/next-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !step.completed }),
      });

      if (!response.ok) {
        throw new Error('Failed to update next step');
      }

      const updated = await response.json();
      
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

        // Debug: Log interaction_timeline to see if meetings are included
        if (data && data.interaction_timeline) {
          console.log('Interaction Timeline Data:', data.interaction_timeline);
          const meetings = data.interaction_timeline.filter((i: Interaction) => i.interaction_type === 'meeting');
          const emails = data.interaction_timeline.filter((i: Interaction) => i.interaction_type === 'email');
          console.log(`Meetings: ${meetings.length}, Emails: ${emails.length}`);
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
  }, [companyId, supabase]);

  // Auto-select thread from query parameter
  useEffect(() => {
    const threadParam = searchParams.get('thread');
    
    if (threadParam && !threadsLoading && threads.length > 0) {
      // Check if the thread exists in the company's threads
      const threadExists = threads.some(t => t.thread_id === threadParam);
      
      if (threadExists) {
        // Thread belongs to this company, select it
        setSelectedThreadId(threadParam);
        setActiveView('Interaction Timeline');
      } else {
        // Thread doesn't exist or doesn't belong to this company
        console.warn(`Thread ${threadParam} not found in company ${companyId}'s threads`);
      }
    }
  }, [searchParams, threads, threadsLoading, companyId]);

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
      <div className="min-h-screen glass-bg flex items-center justify-center">
        <div className="text-center glass-card rounded-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen glass-bg flex items-center justify-center">
        <div className="text-center glass-card rounded-2xl p-8">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Company</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="min-h-screen glass-bg flex items-center justify-center">
        <div className="text-center glass-card rounded-2xl p-8">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Company Not Found</h2>
          <p className="text-gray-600">The requested company could not be found.</p>
        </div>
      </div>
    );
  }

  const { company_details, product_feedback, interaction_timeline } = companyData;

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

  // Sentiment chip styles for company overall sentiment
  const sentimentStyles: Record<string, string> = {
    'Healthy': 'bg-green-100 text-green-800',
    'At Risk': 'bg-red-100 text-red-800',
    'Neutral': 'bg-yellow-100 text-yellow-800',
    // Sentiment values
    'Positive': 'bg-green-100 text-green-800',
    'Very Positive': 'bg-green-100 text-green-800',
    'Negative': 'bg-red-100 text-red-800',
    'Very Negative': 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen glass-bg">
      <div className="max-w-6xl mx-auto p-6">
        {/* Back Button */}
        <div className="mb-4">
          <Link 
            href="/dashboard/customer-threads"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors glass-button rounded-xl px-4 py-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customer Threads
          </Link>
        </div>

        {/* Header */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{company_details.company_name}</h1>
              <p className="text-gray-600 mt-1">Domain: {company_details.domain_name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
                {/* Status pill */}
              <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                  {company_details.status || 'Active'}
                </span>

                {/* Overall Sentiment pill */}
                {company_details.overall_sentiment && (
                  <span
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                      sentimentStyles[company_details.overall_sentiment] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {company_details.overall_sentiment}
                  </span>
                )}

                {/* Health score */}
                {company_details.health_score !== null && (
                  <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-sm font-medium">Health Score:</span>
                    <HealthScoreBar score={company_details.health_score} showLabel={true} />
                  </div>
                )}

                {/* MRR */}
              <span className="text-gray-700 font-medium">
                  MRR: ${company_details.mrr ? company_details.mrr.toLocaleString() : 'N/A'}
                </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="glass-card rounded-2xl p-1 mb-6">
          <div className="flex space-x-1">
            <button
              onClick={() => {
                setActiveView('Overview');
                setSelectedThreadId(null);
              }}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeView === 'Overview'
                  ? 'bg-white/90 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => {
                setActiveView('Threads');
                setSelectedThreadId(null);
              }}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeView === 'Threads'
                  ? 'bg-white/90 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              Threads ({threads.length})
            </button>
            <button
              onClick={() => setActiveView('Interaction Timeline')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeView === 'Interaction Timeline'
                  ? 'bg-white/90 text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
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
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center mb-6">
                <List className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold ml-2 text-gray-900">Overview</h3>
              </div>
              
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left Column - Recent Threads */}
                <div className="w-full md:w-2/3">
                  <h3 className="font-semibold mb-4 text-gray-900">Recent Threads</h3>
                  <div className="space-y-3">
                    {threadsLoading ? (
                      <p className="text-sm text-gray-500">Loading threads...</p>
                    ) : threads.length === 0 ? (
                      <p className="text-sm text-gray-500">No threads found. Threads will appear here after syncing.</p>
                    ) : (
                      threads.slice(0, 3).map((thread) => {
                        // Extract summary from llm_summary
                        const summary = thread.llm_summary;
                        const isError = summary !== null && 'error' in summary;
                        const llmSummary = isError ? null : (summary as LLMSummary | null);
                        const summaryText = llmSummary?.problem_statement || llmSummary?.timeline_summary || thread.snippet || 'No summary available';
                        
                        return (
                          <div key={thread.thread_id} className="glass-bar-row p-4">
                            <div className="flex gap-4">
                              <div className="w-1/4">
                                <div className="flex items-center text-blue-600 mb-1">
                                  <Mail className="h-4 w-4 mr-1" />
                                  <span className="font-semibold text-sm">Thread</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {thread.last_message_date ? formatDate(thread.last_message_date) : 'No date'}
                                </div>
                              </div>
                              <div className="w-3/4">
                                <p className="text-gray-900 font-semibold mb-1">{thread.subject || 'No Subject'}</p>
                                <p className="text-sm text-gray-600 line-clamp-1">{summaryText}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Column - Overall Sentiment */}
                <div className="w-full md:w-1/3">
                  <h3 className="font-semibold mb-4 text-gray-900">Overall Sentiment</h3>
                  {(() => {
                    const sentimentData = getSentimentFromHealthScore(company_details.health_score);
                    if (sentimentData) {
                      const IconComponent = sentimentData.icon;
                      return (
                        <div className={`glass-card rounded-xl p-4 ${sentimentData.colors.bg} ${sentimentData.colors.border}`}>
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
                        <div className="glass-card rounded-xl p-4 bg-gray-50/50 border-gray-200/50">
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
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Product Feedback</h2>
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
                      
                      // For emails (legacy), if we have company_id, link to company page
                      if (feedback.source_type === 'email' && feedback.company_id) {
                        return `/dashboard/customer-threads/${feedback.company_id}`;
                      }
                      
                      return null;
                    };
                    
                    const sourceLink = getSourceLink();
                    const sourceLabel = feedback.source 
                      ? feedback.source.charAt(0).toUpperCase() + feedback.source.slice(1)
                      : 'Unknown';
                    
                    return (
                      <div key={feedback.id || index} className="glass-bar-row p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-gray-900">{feedback.title}</h3>
                              {feedback.status && (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  feedback.status === 'resolved' ? 'bg-green-50 text-green-700 border border-green-200' :
                                  feedback.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  feedback.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                                  'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                }`}>
                                  {feedback.status.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            {feedback.source && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                                <span>From {sourceLabel}</span>
                                {sourceLink && (
                                  <Link 
                                    href={sourceLink}
                                    className="text-blue-600 hover:text-blue-800 underline font-medium"
                                  >
                                    View Source →
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                            feedback.urgency === 'High' ? 'bg-red-50 text-red-700 border border-red-200' :
                            feedback.urgency === 'Medium' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                            'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {feedback.urgency}
                          </span>
                        </div>
                        <p className="text-gray-700 mb-2">{feedback.description}</p>
                        {feedback.created_at && (
                          <p className="text-xs text-gray-500 mt-2">
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
              <div className="glass-card rounded-2xl p-6">
                {/* Main Section Header */}
                <div className="flex items-center gap-2 mb-6">
                  <Clock className="h-6 w-6 text-gray-600" />
                  <h3 className="text-xl font-semibold text-gray-900">Next Steps</h3>
                </div>
                
                {/* Active Next Steps - Collapsible */}
                {nextSteps.filter(s => !s.completed).length > 0 && (
                  <div className="mb-6">
                    <button
                      onClick={() => setActiveExpanded(!activeExpanded)}
                      className="flex items-center gap-2 mb-4 w-full text-left hover:text-gray-900 transition-colors"
                    >
                      <Users className="h-5 w-5 text-gray-600" />
                      <h4 className="font-semibold text-gray-900">Active Next Steps</h4>
                      <span className="ml-auto text-sm text-gray-600">
                        ({nextSteps.filter(s => !s.completed).length})
                        {activeExpanded ? <ChevronDown className="w-4 h-4 inline ml-1" /> : <ChevronRight className="w-4 h-4 inline ml-1" />}
                      </span>
                    </button>
                    
                    {activeExpanded && (
                      <ul className="space-y-3">
                        {nextSteps.filter(s => !s.completed).map((step) => (
                        <li key={step.id} className="glass-bar-row p-4">
                          <div className="flex items-start gap-4">
                          <button
                            onClick={() => toggleNextStep(step)}
                            disabled={updatingStepId === step.id}
                              className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                              step.completed
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-gray-300 hover:border-blue-600'
                            } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                              {step.completed && <CheckCircle className="w-4 h-4 text-white" />}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-medium mb-2">{step.text}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                              {step.owner && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  Owner: {step.owner}
                                </span>
                              )}
                              {step.due_date && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  Due: {new Date(step.due_date).toLocaleDateString()}
                                </span>
                              )}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Completed Next Steps - Collapsible */}
                {nextSteps.filter(s => s.completed).length > 0 && (
                  <div>
                    <button
                      onClick={() => setCompletedExpanded(!completedExpanded)}
                      className="flex items-center gap-2 mb-4 w-full text-left hover:text-gray-900 transition-colors"
                    >
                      <Users className="h-5 w-5 text-gray-600" />
                      <h4 className="font-semibold text-gray-900">Completed Next Steps</h4>
                      <span className="ml-auto text-sm text-gray-600">
                        ({nextSteps.filter(s => s.completed).length})
                        {completedExpanded ? <ChevronDown className="w-4 h-4 inline ml-1" /> : <ChevronRight className="w-4 h-4 inline ml-1" />}
                      </span>
                    </button>
                    
                    {completedExpanded && (
                      <div className="max-h-96 overflow-y-auto space-y-3">
                          {nextSteps.filter(s => s.completed).map((step) => (
                          <div key={step.id} className="glass-bar-row p-4 opacity-75">
                            <div className="flex items-start gap-4">
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
                                <p className="text-gray-700 line-through mb-2">{step.text}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {step.owner && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                      Owner: {step.owner}
                                    </span>
                                  )}
                                  {step.due_date && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                      Due: {new Date(step.due_date).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Threads View */}
        {activeView === 'Threads' && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Threads</h2>
            <ThreadListView
              threads={threads}
              onThreadSelect={(threadId) => {
                setLoadingThread(true);
                setSelectedThreadId(threadId);
                
                // Find the thread and get its summary
                const thread = threads.find(t => t.thread_id === threadId);
                if (thread && thread.llm_summary) {
                  setSelectedThreadSummary(thread.llm_summary);
                  setLoadingThread(false);
                } else {
                  // Fetch thread if summary not available
                  getThreadById(supabase, threadId).then(({ data: threadData, error }) => {
                    if (error || !threadData) {
                      setSelectedThreadSummary({ error: error?.message || 'Thread not found' });
                    } else {
                      setSelectedThreadSummary(threadData.llm_summary);
                    }
                    setLoadingThread(false);
                  }).catch((err) => {
                    console.error('Error fetching thread:', err);
                    setSelectedThreadSummary({ error: 'Failed to load thread' });
                    setLoadingThread(false);
                  });
                }
              }}
              selectedThreadId={selectedThreadId}
            />
          </div>
        )}

        {/* Interaction Timeline View */}
        {activeView === 'Interaction Timeline' && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Interaction Timeline</h2>
            <p className="text-sm text-gray-600 mb-6">Complete history of calls and emails with detailed summaries.</p>
            
            <div className="space-y-4">
                {interaction_timeline && interaction_timeline.length > 0 ? (
                  interaction_timeline.map((interaction, index) => {
                    // All email interactions should be clickable (they are threads)
                    const isClickable = interaction.interaction_type === 'email' && interaction.id;
                    const isSelected = selectedThreadId === interaction.id;
                    
                    return (
                      <div 
                        key={index} 
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        className={`glass-bar-row p-5 ${isClickable ? 'cursor-pointer hover:shadow-md transition-all hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}`}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isClickable && interaction.id) {
                            console.log('Clicking on thread:', interaction.id);
                            setLoadingThread(true);
                            setSelectedThreadId(interaction.id);
                            
                            try {
                              // Fetch the thread to get its summary
                              const { data: thread, error: threadError } = await getThreadById(supabase, interaction.id);
                              
                              if (threadError || !thread) {
                                console.error('Thread fetch error:', threadError);
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
                          }
                        }}
                        onKeyDown={(e) => {
                          if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
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

                            {/* Click hint for threads */}
                            {isClickable && (
                              <div className="mt-2 text-xs text-blue-600 font-medium">
                                Click anywhere to view full thread conversation →
                              </div>
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
        )}

      {/* Thread Conversation Modal Overlay - Full Page (excluding nav bar) */}
      {selectedThreadId && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50"
          style={{ marginLeft: '256px' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedThreadId(null);
              setSelectedThreadSummary(null);
            }
          }}
        >
          <div 
            className="bg-white w-full h-full overflow-hidden flex flex-col"
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
      </div>
    </div>
  );
};

export default CompanyThreadPage;

