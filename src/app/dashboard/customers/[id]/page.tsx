'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, Check } from 'lucide-react';
import InteractionTimeline from '@/components/InteractionTimeline';
import type { Database } from '@/types/database.types'

// Define types for our data for better type safety
type Interaction = {
  interaction_id: string;
  interaction_type: 'Email' | 'Call'; // Assuming meetings are calls for simplicity
  interaction_date: string;
  summary: string;
  sentiment: 'Positive' | 'Neutral' | 'Frustrated' | 'Very Positive';
  topics: string[];
  next_steps: string[];
  outstanding_issues: string[];
};

type CompanyProfile = {
  company_id: string;
  company_name: string | null;
  domain_name: string;
  health_score: number | null;
  status: string | null;
  mrr: number | null;
  renewal_date: string | null;
  last_interaction_at: string | null;
  created_at: string | null;
  customers: Array<{
    customer_id: string;
    email: string | null;
    full_name: string | null;
    company_id: string;
  }>;
  emails: Array<{
    id: string;
    subject: string;
    sender: string;
    received_at: string;
    body_text: string | null;
    body_html: string | null;
  }>;
  total_customers: number;
  total_emails: number;
};

type EmailRow = Database['public']['Tables']['emails']['Row']
type MeetingRow = Database['public']['Tables']['meetings']['Row']
type CompanyWithInteractions = CompanyProfile & {
  emails?: EmailRow[]
  meetings?: MeetingRow[]
}

function getMeetingStart(meeting: MeetingRow): string {
  const m = meeting as unknown as { start_time?: string }
  return m.start_time ?? ''
}

export default function CompanyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  useEffect(() => {
    if (id) {
      const fetchCompanyData = async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/companies/${id}`);
          if (!response.ok) {
            throw new Error('Failed to fetch company data');
          }
          const data = await response.json();
          setCompany(data);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch company data';
          setError(errorMessage);
        } finally {
          setLoading(false);
        }
      };
      fetchCompanyData();
    }
  }, [id]);
  
  const statusStyles = {
    'Healthy': 'bg-green-100 text-green-800',
    'Needs Attention': 'bg-yellow-100 text-yellow-800',
    'At Risk': 'bg-red-100 text-red-800',
  };

  const sentimentStyles = {
    'Very Positive': 'bg-green-100 text-green-800 border-green-200',
    'Positive': 'bg-green-50 text-green-700 border-green-100',
    'Neutral': 'bg-gray-100 text-gray-700 border-gray-200',
    'Frustrated': 'bg-red-100 text-red-800 border-red-200',
  };

  function renderTimeline() {
    return <InteractionTimeline data={company} />
  }

  function renderInteractionModal() {
    if (!selectedInteraction) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg relative transform transition-all animate-slide-up">
          <button onClick={() => setSelectedInteraction(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <XCircle size={24} />
          </button>
          <div className="p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">{selectedInteraction.interaction_type} - {new Date(selectedInteraction.interaction_date).toLocaleDateString()}</h3>
            
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</h4>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-md text-sm">{selectedInteraction.summary}</p>
              </div>

              {selectedInteraction.topics && selectedInteraction.topics.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Topics Discussed</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedInteraction.topics.map((topic, i) => <span key={i} className="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">{topic}</span>)}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Sentiment</h4>
                <span className={`text-sm font-medium px-3 py-1 rounded-full border ${sentimentStyles[selectedInteraction.sentiment]}`}>{selectedInteraction.sentiment}</span>
              </div>
              
              {selectedInteraction.next_steps && selectedInteraction.next_steps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Next Steps</h4>
                  <ul className="space-y-1 text-gray-700 text-sm">
                    {selectedInteraction.next_steps.map((step, i) => <li key={i} className="flex items-center"><Check size={16} className="text-green-500 mr-2 flex-shrink-0" />{step}</li>)}
                  </ul>
                </div>
              )}

              {selectedInteraction.outstanding_issues && selectedInteraction.outstanding_issues.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Outstanding Issues</h4>
                  <ul className="space-y-1 text-gray-700 text-sm">
                      {selectedInteraction.outstanding_issues.map((issue, i) => <li key={i} className="flex items-center"><AlertTriangle size={16} className="text-yellow-500 mr-2 flex-shrink-0" />{issue}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8">Loading customer profile...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  if (!company) {
    return <div className="p-8">Company not found.</div>;
  }

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => router.back()} className="flex items-center text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeft size={16} className="mr-2" />
            Back to Companies
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{company.company_name}</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-2">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[company.status as keyof typeof statusStyles] || statusStyles['Healthy']}`}>{company.status || 'Active'}</span>
            <span>Domain: <span className="font-semibold">{company.domain_name}</span></span>
            <span>Health Score: <span className="font-semibold">{company.health_score || 'Not set'}%</span></span>
            <span>MRR: <span className="font-semibold">${company.mrr ? company.mrr.toLocaleString() : 'Not set'}</span></span>
            <span>Customers: <span className="font-semibold">{company.total_customers}</span></span>
            <span>Emails: <span className="font-semibold">{company.total_emails}</span></span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav className="inline-flex bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setActiveTab('Overview')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === 'Overview' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('Customers')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === 'Customers' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              Customers
            </button>
            <button
              onClick={() => setActiveTab('Emails')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === 'Emails' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              Emails
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'Overview' && (
          <div className="space-y-8">
            {/* Company Overview Section */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Company Overview</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Company Details</h3>
                        <div className="space-y-2">
                            <p><span className="font-medium">Company Name:</span> {company.company_name}</p>
                            <p><span className="font-medium">Domain:</span> {company.domain_name}</p>
                            <p><span className="font-medium">Status:</span> {company.status || 'Active'}</p>
                            <p><span className="font-medium">Health Score:</span> {company.health_score || 'Not set'}%</p>
                            <p><span className="font-medium">MRR:</span> ${company.mrr ? company.mrr.toLocaleString() : 'Not set'}</p>
                            <p><span className="font-medium">Renewal Date:</span> {company.renewal_date ? new Date(company.renewal_date).toLocaleDateString() : 'Not set'}</p>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Activity Summary</h3>
                        <div className="space-y-2">
                            <p><span className="font-medium">Total Customers:</span> {company.total_customers}</p>
                            <p><span className="font-medium">Total Emails:</span> {company.total_emails}</p>
                            <p><span className="font-medium">Last Interaction:</span> {company.last_interaction_at ? new Date(company.last_interaction_at).toLocaleDateString() : 'Not set'}</p>
                            <p><span className="font-medium">Created:</span> {company.created_at ? new Date(company.created_at).toLocaleDateString() : 'Not set'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Company Activity Section */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h2>
                <div className="space-y-4">
                    {company.emails.length > 0 ? (
                        company.emails.slice(0, 3).map((email, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                                <div>
                                    <p className="font-medium text-gray-800">{email.subject}</p>
                                    <p className="text-sm text-gray-600">From: {email.sender}</p>
                                </div>
                                <span className="text-xs text-gray-500">{new Date(email.received_at).toLocaleDateString()}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No recent activity found.</p>
                    )}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'Customers' && (
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Company Customers</h2>
            {company.customers.length > 0 ? (
              <div className="space-y-4">
                {company.customers.map((customer) => (
                  <div key={customer.customer_id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{customer.full_name}</h3>
                        <p className="text-sm text-gray-600">{customer.email}</p>
                      </div>
                      <span className="text-xs text-gray-500">Customer ID: {customer.customer_id}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No customers found for this company.</p>
            )}
          </div>
        )}

        {activeTab === 'Emails' && (
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Emails</h2>
            {company.emails.length > 0 ? (
              <div className="space-y-4">
                {company.emails.slice(0, 10).map((email) => (
                  <div key={email.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-900">{email.subject}</h3>
                      <span className="text-xs text-gray-500">{new Date(email.received_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">From: {email.sender}</p>
                    {email.body_text && (
                      <p className="text-sm text-gray-700 line-clamp-3">{email.body_text.substring(0, 200)}...</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No emails found for this company.</p>
            )}
          </div>
        )}
      </div>
      
      {/* Interaction Modal */}
      {renderInteractionModal()}
    </div>
  );
}
