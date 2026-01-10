import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface BaseCandidate {
  id: string;
  name: string;
  company: string;
  lastContactDate: string; // ISO string
  avatarUrl?: string;
}

// Helper to format "3 weeks ago"
function getTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 60) return { text: '2+ months', color: 'text-red-700 bg-red-50 ring-red-600/20' };
  if (days > 30) return { text: '1 month', color: 'text-orange-700 bg-orange-50 ring-orange-600/20' };
  return { text: `${days} days`, color: 'text-yellow-700 bg-yellow-50 ring-yellow-600/20' };
}

interface TouchingBaseWidgetProps {
  candidates: BaseCandidate[];
  onCandidateClick?: (candidateId: string) => void;
}

export function TouchingBaseWidget({ candidates, onCandidateClick }: TouchingBaseWidgetProps) {
  const [filter, setFilter] = useState<'all' | 'critical'>('all');

  // Simple filter logic
  const displayed = filter === 'all' 
    ? candidates 
    : candidates.filter(c => {
        const days = (Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24);
        return days > 30; // Critical is > 30 days
      });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900">Consider Touching Base</h3>
        {/* Simple Filter Pills */}
        <div className="flex bg-gray-100 p-0.5 rounded-lg">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('critical')}
            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${filter === 'critical' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Needs Attn
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {displayed.length > 0 ? (
          displayed.map((candidate) => {
            const timeStatus = getTimeAgo(candidate.lastContactDate);
            return (
              <div 
                key={candidate.id} 
                onClick={() => onCandidateClick?.(candidate.id)}
                className="group flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                  {candidate.avatarUrl ? (
                    <img src={candidate.avatarUrl} alt={candidate.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    candidate.name.charAt(0)
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">{candidate.name}</h4>
                  <p className="text-xs text-gray-500 truncate">{candidate.company}</p>
                </div>

                {/* Status Badge */}
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${timeStatus.color}`}>
                  {timeStatus.text}
                </span>
                
                {/* Arrow (Visible on Hover) */}
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-gray-400">
            Everyone has been contacted recently!
          </div>
        )}
      </div>
    </div>
  );
}

