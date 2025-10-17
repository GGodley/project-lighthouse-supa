'use client';

import { useParams } from 'next/navigation';
import CompanyPage from '@/components/CompanyPage';

export default function CompanyProfilePage() {
  const params = useParams();
  const { id } = params;

  return <CompanyPage companyId={id as string} />;
}