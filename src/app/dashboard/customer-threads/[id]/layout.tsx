import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getCompanyDetails } from '@/lib/companies/getCompanyDetails';
import CompanyLayoutClient from './CompanyLayoutClient';
import LoadingSkeleton from '@/components/LoadingSkeleton';

export const dynamic = 'force-dynamic';

interface CompanyLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function CompanyLayout({ children, params }: CompanyLayoutProps) {
  const { id } = await params;

  // Fetch company data (Request Memoization - Next.js will deduplicate if page.tsx also calls this)
  const companyData = await getCompanyDetails(id);

  // Error handling: if company not found, trigger notFound()
  if (!companyData) {
    notFound();
  }

  return (
    <CompanyLayoutClient companyData={companyData} companyId={id}>
      <Suspense fallback={<LoadingSkeleton />}>
        {children}
      </Suspense>
    </CompanyLayoutClient>
  );
}

