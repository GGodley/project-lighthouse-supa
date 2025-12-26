'use client';

import React, { useState } from 'react';

interface CompanyAvatarProps {
  domain: string;
  name: string | null;
  className?: string;
}

export default function CompanyAvatar({ domain, name, className = '' }: CompanyAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Generate initials from company name or domain
  const getInitials = () => {
    if (name) {
      // Extract first letters of each word
      const words = name.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    // Fallback to domain initials
    const domainParts = domain.split('.');
    if (domainParts.length > 0) {
      const mainPart = domainParts[0];
      return mainPart.substring(0, 2).toUpperCase();
    }
    return 'CO';
  };

  // Generate a color based on domain for consistent avatar colors
  const getColorFromDomain = (domainStr: string) => {
    let hash = 0;
    for (let i = 0; i < domainStr.length; i++) {
      hash = domainStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generate a color with good contrast
    const hue = Math.abs(hash % 360);
    const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
    const lightness = 45 + (Math.abs(hash) % 15); // 45-60%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const initials = getInitials();
  const bgColor = getColorFromDomain(domain);
  
  // Try to use Clearbit logo API, fallback to initials
  const logoUrl = `https://logo.clearbit.com/${domain}`;

  return (
    <div className={`flex-shrink-0 ${className}`}>
      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
        {!imageError ? (
          <img
            src={logoUrl}
            alt={name || domain}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-semibold text-sm"
            style={{ backgroundColor: bgColor }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}

