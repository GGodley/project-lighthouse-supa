'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  LayoutGrid, Bell, Users, Sparkles, Calendar, 
  FileText, Settings, LogOut
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Define the Favorite type
interface FavoriteCompany {
  company_id: string;
  company_name: string;
  logo_url?: string; // Optional if we strictly use ui-avatars
}

// Define NavItem props interface
interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const supabase = createClientComponentClient();
  const [favorites, setFavorites] = useState<FavoriteCompany[]>([]);
  
  // Fetch Favorites on Mount
  useEffect(() => {
    async function fetchFavorites() {
      const { data } = await supabase
        .from('companies')
        .select('company_id, company_name')
        .eq('is_favorite', true)
        .order('company_name');
      
      if (data) {
        setFavorites(data);
      }
    }
    fetchFavorites();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Helper for Nav Item Styling
  const NavItem = ({ href, icon: Icon, label, badge }: NavItemProps) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${
          isActive 
            ? 'bg-gray-100 text-gray-900' 
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`} />
          <span>{label}</span>
        </div>
        {badge && (
          <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 h-screen flex flex-col pt-5 pb-4">
      {/* Brand */}
      <div className="px-5 mb-6 flex items-center gap-2.5">
        <div className="w-6 h-6 bg-blue-600 rounded-lg shadow-sm flex items-center justify-center text-white">
            <LayoutGrid className="w-3.5 h-3.5" />
        </div>
        <span className="font-bold text-gray-900 text-sm tracking-tight">Lighthouse</span>
      </div>

      {/* Scrollable Nav Area */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6">
        
        {/* Main Section */}
        <div className="space-y-0.5">
          <NavItem href="/dashboard" icon={LayoutGrid} label="Dashboard" />
          <NavItem href="/dashboard/notifications" icon={Bell} label="Notifications" badge="Coming Soon" />
        </div>

        {/* Resources Section */}
        <div>
          <h3 className="px-2.5 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Resources
          </h3>
          <div className="space-y-0.5">
            <NavItem href="/dashboard/customers" icon={Users} label="Customers" />
            <NavItem href="/dashboard/feature-requests" icon={Sparkles} label="Feature Requests" />
            <NavItem href="/dashboard/meetings" icon={Calendar} label="Meetings" />
            <NavItem href="/dashboard/notes" icon={FileText} label="Notes" />
          </div>
        </div>

        {/* Favorites Section (Dynamic) */}
        {favorites.length > 0 && (
            <div>
              <h3 className="px-2.5 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                Favorites
              </h3>
              <div className="space-y-0.5">
                {favorites.map((company) => {
                  const isActive = pathname === `/dashboard/customer-threads/${company.company_id}`;
                  return (
                    <Link
                      key={company.company_id}
                      href={`/dashboard/customer-threads/${company.company_id}`}
                      className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                        isActive 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {/* Logo Avatar */}
                      <div className="w-4 h-4 rounded-sm overflow-hidden shrink-0 relative">
                        <Image 
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name)}&background=random&size=32`} 
                          alt={company.company_name}
                          width={16}
                          height={16}
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <span className="truncate">{company.company_name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
        )}
      </div>

      {/* Footer / System */}
      <div className="px-3 mt-auto pt-4 border-t border-gray-100 space-y-0.5">
        <NavItem href="/dashboard/settings" icon={Settings} label="Settings" />
        <button 
            onClick={handleLogout}
            className="w-full group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
            <LogOut className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
            <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

