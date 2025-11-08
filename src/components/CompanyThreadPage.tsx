import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, List, ArrowUpRight, Clock, Users, Sparkles, Mail, ArrowLeft } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useCompanyThreads } from '@/hooks/useCompanyThreads';
import ThreadListView from './ThreadListView';
import ThreadConversationView from './ThreadConversationView';

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
  created_at: string;
  updated_at: string;
}

interface CompanyData {
  company_details: CompanyDetails;
  product_feedback: ProductFeedback[];
  all_next_steps: string[];
}

const CompanyThreadPage: React.FC<CompanyThreadPageProps> = ({ companyId }) => {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'Overview' | 'Threads'>('Overview');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const supabase = useSupabase();

  // Get threads for this company
  const { threads, loading: threadsLoading } = useCompanyThreads(companyId);

  // Get selected thread's summary
  const selectedThread = threads.find(t => t.thread_id === selectedThreadId);

  // Next Steps state management
  const [nextSteps, setNextSteps] = useState<Array<{id: number, text: string, completed: boolean}>>([]);

  // Toggle function for next steps
  const toggleNextStep = (id: number) => {
    setNextSteps(
      nextSteps.map(step => 
        step.id === id ? { ...step, completed: !step.completed } : step
      )
    );
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
        if (data && data.all_next_steps) {
          setNextSteps(
            data.all_next_steps.map((step: string, index: number) => ({
              id: index,
              text: step,
              completed: false
            }))
          );
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

  const { company_details, product_feedback } = companyData;

  // Sentiment chip styles for company overall sentiment
  const sentimentStyles: Record<string, string> = {
    'Healthy': 'bg-green-100 text-green-800',
    'At Risk': 'bg-red-100 text-red-800',
  };

  // Convert raw health score to display percentage
  const convertScoreToPercentage = (score: number | null): number => {
    if (score === null || score === undefined) return 70;
    const baselinePercent = 70;
    const maxScore = 10;
    const minScore = -10;

    if (score >= maxScore) { return 100; }
    if (score <= minScore) { return 0; }

    if (score > 0) {
      const percentPerPoint = (100 - baselinePercent) / maxScore;
      return Math.round(baselinePercent + (score * percentPerPoint));
    }

    if (score < 0) {
      const percentPerPoint = (baselinePercent - 0) / Math.abs(minScore);
      return Math.round(baselinePercent + (score * percentPerPoint));
    }

    return baselinePercent;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Back Button */}
        <div className="mb-4">
          <Link 
            href="/dashboard/customer-threads"
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customer Threads
          </Link>
        </div>

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
                <span className="text-slate-600">
                  Health Score: {convertScoreToPercentage(company_details.health_score)}%
                </span>

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
              onClick={() => {
                setActiveView('Overview');
                setSelectedThreadId(null);
              }}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeView === 'Overview'
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveView('Threads')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeView === 'Threads'
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Threads ({threads.length})
            </button>
          </div>
        </div>

        {/* Overview View */}
        {activeView === 'Overview' && (
          <div className="space-y-6">
            {/* Overview Card */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="bg-gray-100 px-4 py-3 border-b">
                <div className="flex items-center">
                  <List className="h-5 w-5 text-gray-500" />
                  <h3 className="text-lg font-semibold ml-2">Overview</h3>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row">
                {/* Left Column - Recent Threads */}
                <div className="w-full md:w-2/3 p-4">
                  <h3 className="font-semibold mb-3">Recent Threads</h3>
                  <div className="space-y-3">
                    {threadsLoading ? (
                      <p className="text-sm text-gray-500">Loading threads...</p>
                    ) : threads.length === 0 ? (
                      <p className="text-sm text-gray-500">No threads found. Threads will appear here after syncing.</p>
                    ) : (
                      threads.slice(0, 3).map((thread) => (
                        <div key={thread.thread_id} className="flex py-3">
                          <div className="w-1/4">
                            <div className="flex items-center text-purple-600">
                              <Mail className="h-4 w-4 mr-1" />
                              <span className="font-semibold">Thread</span>
                            </div>
                            <div className="text-sm text-gray-500">
                              {thread.last_message_date ? formatDate(thread.last_message_date) : 'No date'}
                            </div>
                          </div>
                          <div className="w-3/4">
                            <p className="text-gray-700 font-medium">{thread.subject || 'No Subject'}</p>
                            <p className="text-sm text-gray-500 line-clamp-1">{thread.snippet || 'No preview'}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Column - Overall Sentiment */}
                <div className="w-full md:w-1/3 p-4">
                  <h3 className="font-semibold mb-3">Overall Sentiment</h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <ArrowUpRight className="h-5 w-5 text-green-600" />
                      <strong className="ml-2 text-green-800">Positive</strong>
                    </div>
                    <p className="text-sm text-gray-700">
                      Customer shows high satisfaction with current services. Recent interactions indicate strong engagement and interest in expanding usage. No major concerns raised in recent communications.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Feedback */}
            {product_feedback && product_feedback.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Product Feedback</h2>
                <div className="space-y-4">
                  {product_feedback.map((feedback, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-slate-800">{feedback.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          feedback.urgency === 'High' ? 'bg-red-100 text-red-800' :
                          feedback.urgency === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {feedback.urgency}
                        </span>
                      </div>
                      <p className="text-slate-600">{feedback.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {nextSteps && nextSteps.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-6 w-6 text-gray-500" />
                  <h3 className="text-xl font-semibold text-gray-900">Next Steps</h3>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-5 w-5 text-gray-500" />
                      <h4 className="font-semibold">Discussed with Customer</h4>
                    </div>
                    
                    <ul className="space-y-3">
                      {nextSteps.map((step) => (
                        <li key={step.id} className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleNextStep(step.id)}
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                step.completed
                                  ? 'bg-indigo-600 border-indigo-600'
                                  : 'border-gray-300 hover:border-indigo-600'
                              }`}
                            >
                              {step.completed && <div className="w-2 h-2 bg-white rounded-full"></div>}
                            </button>
                            <span className={`text-gray-700 ${step.completed ? 'line-through text-gray-400' : ''}`}>
                              {step.text}
                            </span>
                          </div>
                          
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              step.completed
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {step.completed ? 'Done' : 'To Do'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-5 w-5 text-gray-500" />
                      <h4 className="font-semibold">Suggested Best Practices</h4>
                    </div>
                    
                    <ul className="space-y-3">
                      <li className="p-3 bg-pink-50 border border-pink-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 bg-pink-700 rounded-full flex-shrink-0"></span>
                          <span className="text-gray-700">Proactive outreach before renewal date (90 days prior)</span>
                        </div>
                      </li>
                      <li className="p-3 bg-pink-50 border border-pink-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 bg-pink-700 rounded-full flex-shrink-0"></span>
                          <span className="text-gray-700">Introduce customer to success manager for better support</span>
                        </div>
                      </li>
                      <li className="p-3 bg-pink-50 border border-pink-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 bg-pink-700 rounded-full flex-shrink-0"></span>
                          <span className="text-gray-700">Schedule executive-level relationship building meeting</span>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Threads View */}
        {activeView === 'Threads' && (
          <div className="space-y-6">
            {selectedThreadId && selectedThread ? (
              <ThreadConversationView
                threadId={selectedThreadId}
                threadSummary={selectedThread.llm_summary}
                onClose={() => setSelectedThreadId(null)}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Email Threads</h2>
                <p className="text-sm text-gray-600 mb-6">
                  {threadsLoading 
                    ? 'Loading threads...' 
                    : threads.length === 0 
                    ? 'No threads found. Threads will appear here after syncing from Gmail.'
                    : 'Click on a thread to view the conversation and AI-generated summary.'}
                </p>
                <ThreadListView
                  threads={threads}
                  onThreadSelect={setSelectedThreadId}
                  selectedThreadId={selectedThreadId}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyThreadPage;

