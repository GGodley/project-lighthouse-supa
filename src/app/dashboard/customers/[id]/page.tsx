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

type CustomerProfile = {
  id: string;
  name: string;
  contact_email: string;
  company_name: string | null;
  health_score: number | null;
  status: 'Healthy' | 'Needs Attention' | 'At Risk';
  mrr: number | null;
  renewal_date: string | null;
  last_interaction_at: string | null;
  overall_sentiment: string | null;
  email: string | null;
  created_at: string;
  user_id: string;
  allInteractions: Interaction[];
  featureRequests: { urgency: string; features: { title: string } }[];
};

type EmailRow = Database['public']['Tables']['emails']['Row']
type MeetingRow = Database['public']['Tables']['meetings']['Row']
type CustomerWithInteractions = CustomerProfile & {
  emails?: EmailRow[]
  meetings?: MeetingRow[]
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [customer, setCustomer] = useState<CustomerWithInteractions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  useEffect(() => {
    if (id) {
      const fetchCustomerData = async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/customers/${id}`);
          if (!response.ok) {
            throw new Error('Failed to fetch customer data');
          }
          const data = await response.json();
          setCustomer(data);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch customer data';
          setError(errorMessage);
        } finally {
          setLoading(false);
        }
      };
      fetchCustomerData();
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
    return <InteractionTimeline data={customer} />
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

  if (!customer) {
    return <div className="p-8">Customer not found.</div>;
  }

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => router.back()} className="flex items-center text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeft size={16} className="mr-2" />
            Back to Customers
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{customer.company_name || customer.name}</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-2">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[customer.status]}`}>{customer.status}</span>
            <span>Contact Email: <span className="font-semibold">{customer.contact_email}</span></span>
            <span>Health Score: <span className="font-semibold">{customer.health_score || 'Not set'}%</span></span>
            <span>MRR: <span className="font-semibold">${customer.mrr ? customer.mrr.toLocaleString() : 'Not set'}</span></span>
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
              onClick={() => setActiveTab('Timeline')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === 'Timeline' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              Interaction Timeline
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'Overview' && (
          <div className="space-y-8">
            {/* Overview Section */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Overview</h2>
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Recent Interactions</h3>
                        <ul className="space-y-4">
                          {(() => {
                            const emails: EmailRow[] = Array.isArray(customer?.emails) ? (customer!.emails as EmailRow[]) : []
                            const meetings: MeetingRow[] = Array.isArray(customer?.meetings) ? (customer!.meetings as MeetingRow[]) : []

                            type Item = { date: string; summary: string | null }
                            const items: Item[] = [
                              ...emails.map((e): Item => ({ date: e.received_at ?? '', summary: e.snippet })),
                              ...meetings.map((m): Item => ({ date: (m as any).start_time ?? (m as any).meeting_date ?? '', summary: m.summary }))
                            ]
                              .filter((i) => Boolean(i.date))
                              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                              .slice(0, 3)

                            return items.length > 0 ? (
                              items.map((item, index) => (
                                <li key={index}>
                                  <p className="font-medium text-gray-800 text-sm">{item.summary || 'No summary available.'}</p>
                                  <p className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString()}</p>
                                </li>
                              ))
                            ) : (
                              <li className="text-gray-500 text-sm">No interactions found</li>
                            )
                          })()}
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Overall Sentiment</h3>
                         <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
                            <p className="text-sm font-semibold text-green-800 flex items-center"><CheckCircle size={16} className="mr-2" /> Positive</p>
                            <p className="text-xs text-green-700 mt-1">Customer shows high satisfaction with current services. Recent interactions indicate strong engagement.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Feedback Section */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Product Feedback</h2>
                <div className="space-y-4">
                    {(customer.featureRequests ?? []).map((req, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                            <div>
                                <p className="font-medium text-gray-800">{req.features.title}</p>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${req.urgency === 'High' ? 'bg-red-100 text-red-800' : req.urgency === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                        Urgency: {req.urgency}
                                    </span>
                                </div>
                            </div>
                            <span className="text-xs font-medium text-gray-500">Planned</span>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'Timeline' && renderTimeline()}
      </div>
      
      {/* Interaction Modal */}
      {renderInteractionModal()}
    </div>
  );
}
