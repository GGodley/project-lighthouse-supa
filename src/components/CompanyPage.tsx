import React, { useState, useEffect } from 'react';
import { Phone, Mail, Calendar, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

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
  all_next_steps: string[];
}

const CompanyPage: React.FC<CompanyPageProps> = ({ companyId }) => {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'Overview' | 'Interaction Timeline'>('Overview');

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!companyId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase.functions.invoke('get-company-page-details', {
          body: { company_id: companyId }
        });

        if (error) {
          throw error;
        }

        setCompanyData(data);
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
        return 'bg-green-100 text-green-800 border-green-200';
      case 'neutral':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'frustrated':
      case 'negative':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSentimentIcon = (sentiment: string | null): React.ReactElement => {
    switch (sentiment?.toLowerCase()) {
      case 'positive':
      case 'very positive':
        return <CheckCircle className="w-4 h-4" />;
      case 'frustrated':
      case 'negative':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <TrendingUp className="w-4 h-4" />;
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

  const { company_details, product_feedback, interaction_timeline, all_next_steps } = companyData;

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
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                  {company_details.status || 'Active'}
                </span>
                <span className="text-slate-600">
                  Health: {company_details.health_score || 'N/A'}%
                </span>
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
            {/* Recent Interactions */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Recent Interactions</h2>
              <div className="space-y-4">
                {interaction_timeline.slice(0, 3).map((interaction, index) => (
                  <div key={index} className="flex items-start space-x-3 p-4 bg-slate-50 rounded-lg">
                    <div className="flex-shrink-0">
                      {interaction.interaction_type === 'meeting' ? (
                        <Phone className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Mail className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-slate-800">{interaction.title}</h3>
                        <span className="text-sm text-slate-500">{formatDate(interaction.interaction_date)}</span>
                      </div>
                      <p className="text-slate-600 mt-1">{interaction.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Health Data */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Health Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">{company_details.health_score || 'N/A'}</div>
                  <div className="text-sm text-slate-600">Health Score</div>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">
                    ${company_details.mrr ? company_details.mrr.toLocaleString() : 'N/A'}
                  </div>
                  <div className="text-sm text-slate-600">Monthly Revenue</div>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">
                    {company_details.renewal_date ? formatDate(company_details.renewal_date) : 'N/A'}
                  </div>
                  <div className="text-sm text-slate-600">Renewal Date</div>
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
            {all_next_steps && all_next_steps.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Next Steps</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {all_next_steps.map((step, index) => (
                    <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-slate-800">{step}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Interaction Timeline View */}
        {activeView === 'Interaction Timeline' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">Interaction Timeline</h2>
            <div className="space-y-4">
              {interaction_timeline.map((interaction, index) => (
                <div key={index} className="flex items-start space-x-4 p-4 bg-slate-50 rounded-lg">
                  <div className="flex-shrink-0">
                    {interaction.interaction_type === 'meeting' ? (
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Mail className="w-5 h-5 text-green-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-slate-800">{interaction.title}</h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-slate-500">{formatDate(interaction.interaction_date)}</span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(interaction.sentiment)}`}>
                          {getSentimentIcon(interaction.sentiment)}
                          <span className="ml-1">{interaction.sentiment}</span>
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-600">{interaction.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyPage;
