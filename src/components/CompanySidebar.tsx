/* eslint-disable @next/next/no-img-element */
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const oneLiner = company.ai_insights?.one_liner || null;

  const handleGenerateProfile = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const result = await generateCompanyInsights(company.company_id, company.domain_name);
      
      if (!result.success) {
        setError(result.error || 'Failed to generate insights');
      } else {
        setSuccessMessage('Profile generation started! Please refresh the page in a few moments to see the results.');
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      setError('An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full p-8 border-r border-gray-100">
      {/* Company Profile Content */}
      <div className="space-y-4">
        {/* Avatar - Top Left */}
        <div className="flex items-start mb-2">
          {company.domain_name && !logoError ? (
            <img
              src={`https://logo.clearbit.com/${company.domain_name}`}
              alt={`${company.company_name || company.domain_name} logo`}
              className="w-14 h-14 rounded-lg object-contain border border-gray-100 shadow-sm"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-14 h-14 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-sm">
              {company.company_name?.charAt(0) || company.domain_name?.charAt(0) || "A"}
            </div>
          )}
        </div>

        {/* Name - Left Aligned */}
        <h1 className="text-xl font-bold text-gray-900 text-left mb-1 tracking-tight antialiased">
          {company.company_name || company.domain_name}
        </h1>

        {/* Subtext (AI One-Liner) - Left Aligned */}
        <div className="mb-3">
          {oneLiner ? (
            <p className="text-sm text-gray-500 text-left">{oneLiner}</p>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleGenerateProfile}
                disabled={isGenerating}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {isGenerating ? 'Triggering...' : 'Generate Profile'}
              </button>
              {successMessage && (
                <p className="text-xs text-green-600 text-left">{successMessage}</p>
              )}
              {error && (
                <p className="text-xs text-red-500 text-left">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Action Bar - Left Aligned */}
        <div className="flex items-center justify-start gap-2 mb-4">
          {/* Primary: Compose Email */}
          <button className="flex items-center gap-2 px-4 h-9 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Mail className="w-4 h-4" />
            Compose email
          </button>

          {/* Secondary: Icon buttons */}
          <button className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          <button className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
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

