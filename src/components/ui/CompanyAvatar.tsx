/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';

interface CompanyAvatarProps {
  domain: string;
  name: string | null;
  className?: string;
}

export default function CompanyAvatar({ domain, name, className = '' }: CompanyAvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Extract size classes from className or default to w-10 h-10
  const hasSizeClasses = className.includes('w-') && className.includes('h-');
  const sizeClasses = hasSizeClasses 
    ? (className.match(/(w-\d+|h-\d+)/g) || []).join(' ')
    : 'w-10 h-10';

  // Generate initials from company name or domain
  const getInitials = () => {
    if (name) {
      const words = name.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    if (domain) {
      const domainParts = domain.split('.');
      if (domainParts.length > 0) {
        const mainPart = domainParts[0];
        return mainPart.substring(0, 2).toUpperCase();
      }
    }
    return 'CO';
  };

  const initials = getInitials();

  // Use Unavatar.io for company logos (requires domain)
  const unavatarUrl = domain && domain.trim().length > 0
    ? `https://unavatar.io/${domain}`
    : null;

  // Show initials if no domain or image error
  if (!unavatarUrl || imgError) {
    return (
      <div className="flex-shrink-0">
        <div className={`relative ${sizeClasses} rounded-md overflow-hidden bg-gray-200 flex items-center justify-center`}>
          <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm bg-blue-600">
            {initials}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0">
      <div className={`relative ${sizeClasses} rounded-md overflow-hidden bg-gray-200 flex items-center justify-center`}>
        <img
          src={unavatarUrl}
          alt={name || domain}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    </div>
  );
}
