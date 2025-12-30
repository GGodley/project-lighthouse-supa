'use client';

import { useEffect, useState } from 'react';
import { Mail, Video } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useParams } from 'next/navigation';
import type { CompanyData } from '@/lib/companies/getCompanyDetails';

export default function TimelinePage() {
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

  if (loading || !companyData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-6 h-6 rounded-full bg-gray-200"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { interaction_timeline } = companyData;

  if (!interaction_timeline || interaction_timeline.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm">No interactions found for this company.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

      {/* Timeline items */}
      <div className="space-y-0">
        {interaction_timeline.map((item, index) => {
          const isEmail = item.interaction_type === 'email';
          const Icon = isEmail ? Mail : Video;

          return (
            <div key={`${item.interaction_type}-${item.id}`} className="relative flex gap-4 pb-6">
              {/* Icon on timeline */}
              <div className="relative z-10 flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${isEmail ? 'text-blue-600' : 'text-purple-600'}`} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {item.title || (isEmail ? 'Email thread' : 'Meeting')}
                    </p>
                    {item.summary && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-500">
                    {formatRelativeTime(item.interaction_date)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

