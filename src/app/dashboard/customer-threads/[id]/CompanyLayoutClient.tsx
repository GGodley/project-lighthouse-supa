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
      <div className="mx-auto max-w-7xl my-8">
        {/* Main Profile Container */}
        <div className="bg-white border border-gray-200 rounded-[2rem] shadow-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr]">
            {/* Left Column: Sidebar */}
            <div className="w-full md:w-80">
              <CompanySidebar company={companyData.company_details} />
            </div>

            {/* Right Column: Content */}
            <div className="flex-1 p-8">
              {/* Navigation Header */}
              <CompanyNav companyId={companyId} />
              
              {/* Page Content */}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

