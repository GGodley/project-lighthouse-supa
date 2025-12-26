'use client';

import React, { useState } from 'react';

interface CompanyAvatarProps {
  domain: string;
  name: string | null;
  className?: string;
}

export default function CompanyAvatar({ domain, name, className = '' }: CompanyAvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Validate domain - if invalid, show initials immediately
  const isValidDomain = domain && domain.trim().length > 0;

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
    if (domain) {
      const domainParts = domain.split('.');
      if (domainParts.length > 0) {
        const mainPart = domainParts[0];
        return mainPart.substring(0, 2).toUpperCase();
      }
    }
    return 'CO';
  };

  // Generate a color based on domain for consistent avatar colors
  const getColorFromDomain = (domainStr: string) => {
    if (!domainStr) return 'hsl(200, 60%, 50%)'; // Default blue if no domain
    
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
  const bgColor = getColorFromDomain(domain || '');
  
  // Use unavatar.io with strict fallback mode
  const unavatarUrl = isValidDomain 
    ? `https://unavatar.io/${domain}?fallback=false`
    : null;

  // If no valid domain, show initials immediately
  if (!isValidDomain || imgError) {
    return (
      <div className={`flex-shrink-0 ${className}`}>
        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
          <div
            className="w-full h-full flex items-center justify-center text-white font-semibold text-sm"
            style={{ backgroundColor: bgColor }}
          >
            {initials}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-shrink-0 ${className}`}>
      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
        <img
          src={unavatarUrl!}
          alt={name || domain}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    </div>
  );
}

