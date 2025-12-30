'use client';

import { useState } from 'react';
import { Mail, Copy, RefreshCw, MoreVertical, Sparkles } from 'lucide-react';
import { generateCompanyInsights } from '@/app/actions/generateCompanyInsights';
import CompanyContactsList from './CompanyContactsList';
import type { CompanyDetails } from '@/lib/companies/getCompanyDetails';

interface CompanySidebarProps {
  company: CompanyDetails;
}

export default function CompanySidebar({ company }: CompanySidebarProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [oneLiner, setOneLiner] = useState(company.ai_insights?.one_liner || null);

  // Construct avatar URL with Unavatar and UI Avatars fallback
  const avatarUrl = `https://unavatar.io/${company.domain_name}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name || company.domain_name)}&background=random`;

  const handleGenerateProfile = async () => {
    setIsGenerating(true);
    try {
      const insights = await generateCompanyInsights(company.company_id, company.domain_name);
      if (insights?.one_liner) {
        setOneLiner(insights.one_liner);
      }
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Company Profile Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Avatar - Top Left */}
        <div className="flex items-start mb-4">
          <img
            src={avatarUrl}
            alt={company.company_name || company.domain_name}
            className="w-16 h-16 rounded-full border border-gray-200 bg-white object-contain p-1"
            onError={(e) => {
              // Fallback to UI Avatars if Unavatar fails
              const target = e.target as HTMLImageElement;
              target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name || company.domain_name)}&background=random`;
            }}
          />
        </div>

        {/* Name - Left Aligned */}
        <h1 className="text-xl font-bold text-gray-900 text-left mb-2">
          {company.company_name || company.domain_name}
        </h1>

        {/* Subtext (AI One-Liner) - Left Aligned */}
        <div className="mb-4">
          {oneLiner ? (
            <p className="text-sm text-gray-500 text-left">{oneLiner}</p>
          ) : (
            <button
              onClick={handleGenerateProfile}
              disabled={isGenerating}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Generate Profile'}
            </button>
          )}
        </div>

        {/* Action Bar - Left Aligned */}
        <div className="flex items-center justify-start gap-2 mb-4">
          {/* Primary: Compose Email */}
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Mail className="w-4 h-4" />
            Compose email
          </button>

          {/* Secondary: Icon buttons */}
          <button className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Separator */}
        <div className="border-t border-gray-200 pt-4">
          <CompanyContactsList companyId={company.company_id} />
        </div>
      </div>
    </div>
  );
}

