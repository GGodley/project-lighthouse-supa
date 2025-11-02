'use client';

import { useParams } from 'next/navigation';
import CompanyThreadPage from '@/components/CompanyThreadPage';

export default function CompanyThreadProfilePage() {
  const params = useParams();
  const { id } = params;

  return <CompanyThreadPage companyId={id as string} />;
}

