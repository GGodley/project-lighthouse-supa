'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/components/SupabaseProvider';
import { useParams } from 'next/navigation';
import type { CompanyData, ProductFeedback } from '@/lib/companies/getCompanyDetails';

export default function RequestsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const supabase = useSupabase();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;
      
      setLoading(true);
      try {
        const functionName = `get-company-page-details?company_id=${companyId}`;
        const { data, error } = await supabase.functions.invoke<CompanyData>(functionName, {
          method: 'GET',
        });

        if (error) {
          throw error;
        }

        setCompanyData(data);
      } catch (err) {
        console.error('Error fetching company data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, supabase]);

  if (loading || !companyData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>
        ))}
      </div>
    );
  }

  const { product_feedback } = companyData;

  if (!product_feedback || product_feedback.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Product Feedback</h2>
        <p className="text-sm text-gray-500">No product feedback found for this company.</p>
      </div>
    );
  }

  // Group by status
  const groupedFeedback = product_feedback.reduce((acc, feedback) => {
    const status = feedback.status || 'open';
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(feedback);
    return acc;
  }, {} as Record<string, ProductFeedback[]>);

  const getSourceLink = (feedback: ProductFeedback): string | null => {
    if (!feedback.source_id || !feedback.source_type) return null;
    
    if (feedback.source_type === 'thread' && feedback.company_id) {
      return `/dashboard/customer-threads/${feedback.company_id}?thread=${feedback.source_id}`;
    }
    
    if (feedback.source_type === 'meeting') {
      return `/dashboard/meetings/${feedback.source_id}`;
    }
    
    if (feedback.source_type === 'email' && feedback.company_id) {
      return `/dashboard/customer-threads/${feedback.company_id}`;
    }
    
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Product Feedback</h2>
        
        {/* Group by status */}
        {Object.entries(groupedFeedback).map(([status, feedbacks]) => (
          <div key={status} className="mb-6 last:mb-0">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 capitalize">
              {status.replace('_', ' ')} ({feedbacks.length})
            </h3>
            
            <div className="space-y-4">
              {feedbacks.map((feedback, index) => {
                const sourceLink = getSourceLink(feedback);
                const sourceLabel = feedback.source 
                  ? feedback.source.charAt(0).toUpperCase() + feedback.source.slice(1)
                  : 'Unknown';
                
                return (
                  <div key={feedback.id || index} className="p-5 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{feedback.title}</h3>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            feedback.status === 'resolved' ? 'bg-green-50 text-green-700 border border-green-200' :
                            feedback.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            feedback.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          }`}>
                            {feedback.status?.replace('_', ' ') || 'Open'}
                          </span>
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
        ))}
      </div>
    </div>
  );
}

