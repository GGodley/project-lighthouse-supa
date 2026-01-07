/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';

interface CompanyAvatarProps {
  domain: string;
  name: string | null;
  className?: string;
}

export default function CompanyAvatar({ domain, name, className = '' }: CompanyAvatarProps) {

  // Extract size classes from className or default to w-10 h-10
  const hasSizeClasses = className.includes('w-') && className.includes('h-');
  const sizeClasses = hasSizeClasses 
    ? (className.match(/(w-\d+|h-\d+)/g) || []).join(' ')
    : 'w-10 h-10';

  // Use ui-avatars.com for company logos
  const avatarUrl = name || domain
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(name || domain || 'C')}&background=random&color=fff&size=128`
    : null;

  return (
    <div className="flex-shrink-0">
      <div className={`relative ${sizeClasses} rounded-md overflow-hidden bg-gray-200 flex items-center justify-center`}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name || domain}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm bg-gray-400">
            CO
          </div>
        )}
      </div>
    </div>
  );
}

