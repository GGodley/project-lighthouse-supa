'use client';

import { CompanyData } from '@/lib/companies/getCompanyDetails';
import CompanySidebar from '@/components/CompanySidebar';
import CompanyNav from '@/components/CompanyNav';

interface CompanyLayoutClientProps {
  companyData: CompanyData;
  companyId: string;
  children: React.ReactNode;
}

export default function CompanyLayoutClient({ 
  companyData, 
  companyId, 
  children 
}: CompanyLayoutClientProps) {
  return (
    <div className="min-h-screen bg-gray-50/95">
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
          {/* Left Column: Sidebar */}
          <div className="w-full md:w-80">
            <CompanySidebar company={companyData.company_details} />
          </div>

          {/* Right Column: Content */}
          <div className="flex-1">
            {/* Navigation Header */}
            <CompanyNav companyId={companyId} />
            
            {/* Page Content */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

