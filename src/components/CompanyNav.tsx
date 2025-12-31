'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface CompanyNavProps {
  companyId: string;
}

export default function CompanyNav({ companyId }: CompanyNavProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/customer-threads/${companyId}`;

  const tabs = [
    { name: 'Highlights', href: basePath },
    { name: 'Timeline', href: `${basePath}/timeline` },
    { name: 'Tasks', href: `${basePath}/tasks` },
    { name: 'Requests', href: `${basePath}/requests` },
  ];

  return (
    <nav className="mb-6 border-b border-gray-200">
      <div className="flex space-x-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || 
            (tab.href === basePath && pathname === basePath);
          
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pb-3 text-sm transition-colors ${
                isActive
                  ? 'text-gray-900 font-semibold'
                  : 'text-gray-500 hover:text-gray-700 font-medium'
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

