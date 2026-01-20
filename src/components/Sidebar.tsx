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
  const [isHovered, setIsHovered] = useState(false);
  
  // Determine if we are "Locked" open (Dashboard only)
  const isLocked = pathname === '/dashboard';
  
  // Calculate effective state: Expanded if locked (Dashboard) OR hovering
  const isExpanded = isLocked || isHovered;

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
        className={`group flex items-center h-10 rounded-lg pl-7 pr-3 text-[13px] font-medium relative transition-all duration-300 ${
          isActive 
            ? 'bg-gray-100 text-gray-900' 
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
        title={!isExpanded ? label : undefined}
      >
        <Icon
          className={`w-4 h-4 shrink-0 z-10 transition-colors ${
            isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'
          }`}
        />

        {/* Smooth text reveal using grid rows to avoid jolt */}
        <div
          className={`
            grid transition-all duration-300 ease-in-out
            ${isExpanded ? 'grid-rows-[1fr] opacity-100 ml-3' : 'grid-rows-[0fr] opacity-0 ml-0'}
          `}
        >
          <span className="overflow-hidden whitespace-nowrap">
            {label}
          </span>
        </div>

        {badge && (
          <span
            className={`
              ml-auto shrink-0 bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap
              transition-all duration-300
              ${isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-0 w-0'}
            `}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`
        shrink-0 h-screen sticky top-0 
        transition-[width] duration-300 ease-in-out
        ${isLocked ? 'w-72' : 'w-20'}
      `}
    >
      {/* Inner Fixed Drawer (Overlay Visual Element) */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          fixed top-0 left-0 h-full bg-white z-[9999]
          border-r border-gray-200 flex flex-col
          transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]
          ${isExpanded ? 'w-72' : 'w-20'}
          ${!isLocked && isHovered ? 'shadow-[10px_0_30px_rgba(0,0,0,0.1)] border-y border-r border-gray-300' : ''}
        `}
      >
        <div className="flex flex-col h-full pt-6 pb-4">
          {/* Brand */}
          <div className="flex items-center pl-7 pr-4 mb-8 h-10">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm relative z-10">
                <LayoutGrid className="w-3.5 h-3.5" />
            </div>
            {/* Smooth Text Reveal */}
            <div
              className={`
                overflow-hidden whitespace-nowrap transition-all duration-300
                ${isExpanded ? 'w-40 opacity-100 ml-3' : 'w-0 opacity-0 ml-0'}
              `}
            >
              <span className="font-bold text-gray-900 text-sm tracking-tight">
                Lighthouse
              </span>
            </div>
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
            <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 h-auto' : 'opacity-0 h-0'}`}>
              <h3 className="px-2.5 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Resources
              </h3>
            </div>
            <div className="space-y-0.5">
              <NavItem href="/dashboard/customer-threads" icon={Users} label="Customers" />
              <NavItem href="/dashboard/feature-requests" icon={Sparkles} label="Feature Requests" badge="Coming Soon" />
              <NavItem href="/dashboard/meetings" icon={Calendar} label="Meetings" badge="Coming Soon" />
              <NavItem href="/dashboard/notes" icon={FileText} label="Notes" badge="Coming Soon" />
            </div>
          </div>

        {/* Favorites Section (Dynamic) */}
        {favorites.length > 0 && (
            <div>
              <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 h-auto' : 'opacity-0 h-0'}`}>
                <h3 className="px-2.5 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  Favorites
                </h3>
              </div>
              <div className="space-y-0.5">
                {favorites.map((company) => {
                  const isActive = pathname === `/dashboard/customer-threads/${company.company_id}`;
                  return (
                    <Link
                      key={company.company_id}
                      href={`/dashboard/customer-threads/${company.company_id}`}
                      className={`group flex items-center h-10 rounded-lg pl-7 pr-3 text-[13px] font-medium relative transition-all duration-300 ${
                        isActive 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      title={!isExpanded ? company.company_name : undefined}
                    >
                      {/* Logo Avatar */}
                      <div className={`${!isExpanded ? 'w-6 h-6' : 'w-4 h-4'} rounded-sm overflow-hidden shrink-0 relative transition-all duration-300`}>
                        <Image 
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name)}&background=random&size=32`} 
                          alt={company.company_name}
                          width={!isExpanded ? 24 : 16}
                          height={!isExpanded ? 24 : 16}
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div
                        className={`
                          grid transition-all duration-300 ease-in-out
                          ${isExpanded ? 'grid-rows-[1fr] opacity-100 ml-3' : 'grid-rows-[0fr] opacity-0 ml-0'}
                        `}
                      >
                        <span className="overflow-hidden whitespace-nowrap">
                          {company.company_name}
                        </span>
                      </div>
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
            className="w-full group flex items-center h-10 rounded-lg pl-7 pr-3 text-[13px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-300"
            title={!isExpanded ? 'Logout' : undefined}
        >
            <LogOut className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
            <div
              className={`
                grid transition-all duration-300 ease-in-out ml-3
                ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
              `}
            >
              <span className="overflow-hidden whitespace-nowrap">
                Logout
              </span>
            </div>
        </button>
      </div>
        </div>
      </div>
    </aside>
  );
}

