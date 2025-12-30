'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Linkedin, Calendar, CheckSquare, MessageSquare } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useParams } from 'next/navigation';
import type { CompanyData } from '@/lib/companies/getCompanyDetails';

export default function HighlightsPage() {
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
      <div className="space-y-6">
        <div className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>
        <div className="h-24 bg-gray-200 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  const { company_details, interaction_timeline, next_steps } = companyData;
  const aiInsights = company_details.ai_insights;
  const linkedinUrl = aiInsights?.linkedin_url || `https://linkedin.com/company/${company_details.company_name || company_details.domain_name}`;

  // Get next upcoming task
  const upcomingTask = next_steps
    ?.filter(step => step.status !== 'done')
    .sort((a, b) => {
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    })[0];

  // Get recent activity (3 items)
  const recentActivity = interaction_timeline?.slice(0, 3) || [];

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Get product feedback count for placeholder
  const productFeedbackCount = companyData.product_feedback?.length || 0;

  return (
    <div className="space-y-6">
      {/* Intelligence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Summary - Spans 2 columns */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Summary</h3>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {aiInsights?.summary || 'No summary available. Click "Generate Profile" in the sidebar to create an AI-generated summary.'}
          </p>
        </div>

        {/* Card 2: LinkedIn - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Linkedin className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">LinkedIn</h3>
          </div>
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View Company Profile →
          </a>
        </div>

        {/* Card 3: Next Step - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Next Step</h3>
          </div>
          {upcomingTask ? (
            <div>
              <p className="text-sm text-gray-700 mb-2">{upcomingTask.text}</p>
              {upcomingTask.due_date && (
                <p className="text-xs text-gray-500">
                  Due: {new Date(upcomingTask.due_date).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No upcoming tasks</p>
          )}
        </div>

        {/* Card 4: Tasks/Requests Placeholder - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Requests</h3>
          </div>
          {productFeedbackCount > 0 ? (
            <div>
              <p className="text-sm text-gray-700 mb-2">{productFeedbackCount} active request{productFeedbackCount !== 1 ? 's' : ''}</p>
              <Link
                href={`/dashboard/customer-threads/${companyId}/requests`}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                View all →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No requests</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <Link
            href={`/dashboard/customer-threads/${companyId}/timeline`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={`${activity.interaction_type}-${activity.id}`} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatRelativeTime(activity.interaction_date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
