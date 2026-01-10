'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

interface CompanyCandidate {
  company_id: string;
  company_name: string;
  last_interaction_at: string | null; // ISO string
}

type FilterType = '2w' | '1m' | '2m';

export function TouchingBaseWidget({ companies }: { companies: CompanyCandidate[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('1m'); // Default to 1 Month

  // Helper: Get days diff
  const getDaysAgo = (dateStr: string | null) => {
    if (!dateStr) return 999; // Never contacted
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  };

  // Filter Logic
  const thresholdDays = {
    '2w': 14,
    '1m': 30,
    '2m': 60
  };

  const filteredList = companies
    .filter(c => {
      const days = getDaysAgo(c.last_interaction_at);
      return days >= thresholdDays[filter];
    })
    .sort((a, b) => getDaysAgo(b.last_interaction_at) - getDaysAgo(a.last_interaction_at)); // Worst first

  // Helper: Time Badge Color
  const getBadgeStyle = (days: number) => {
    if (days >= 60) return 'bg-red-50 text-red-700 border-red-100';
    if (days >= 30) return 'bg-orange-50 text-orange-700 border-orange-100';
    return 'bg-yellow-50 text-yellow-700 border-yellow-100';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header & Controls */}
      <div className="p-5 border-b border-gray-100 space-y-3">
        <h3 className="text-base font-bold text-gray-900">Consider Touching Base</h3>
        
        {/* Segmented Control Buttons */}
        <div className="flex p-1 bg-gray-100/80 rounded-lg">
          {(['2w', '1m', '2m'] as FilterType[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all duration-200 ${
                filter === key 
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              {key === '2m' ? '> 2 Months' : key === '1m' ? '1 Month' : '2 Weeks'}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[400px]">
        {filteredList.length > 0 ? (
          filteredList.map((company) => {
            const daysAgo = getDaysAgo(company.last_interaction_at);
            
            return (
              <div 
                key={company.company_id} 
                onClick={() => router.push(`/dashboard/customer-threads/${company.company_id}`)}
                className="group flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50/50 hover:border-blue-100 border border-transparent transition-all cursor-pointer"
              >
                {/* Logo Avatar */}
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                   <img 
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name)}&background=random&size=64`} 
                      alt={company.company_name}
                      className="w-full h-full object-cover"
                   />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                    {company.company_name}
                  </h4>
                  <p className="text-xs text-gray-400 truncate">
                    Last contact: {company.last_interaction_at ? new Date(company.last_interaction_at).toLocaleDateString() : 'Never'}
                  </p>
                </div>

                {/* Badge */}
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border ${getBadgeStyle(daysAgo)}`}>
                  {daysAgo > 900 ? 'New' : `${daysAgo}d`}
                </span>
                
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 -ml-1 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-center p-4">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-2">
              <span className="text-xl">👏</span>
            </div>
            <p className="text-sm font-medium text-gray-900">All caught up!</p>
            <p className="text-xs text-gray-500 mt-1">No companies matching this filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
