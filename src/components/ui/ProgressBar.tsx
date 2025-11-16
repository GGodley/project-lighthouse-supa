'use client';

import React from 'react';

interface ProgressBarProps {
  percentage: number | null; // 0-100 or null
  className?: string;
}

export default function ProgressBar({ 
  percentage, 
  className = '' 
}: ProgressBarProps) {
  // Handle null or out of range percentages
  const normalizedPercentage = percentage === null || percentage === undefined 
    ? 0 
    : Math.max(0, Math.min(100, percentage));
  
  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-2.5 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
        <div
          className="absolute top-0 left-0 bottom-0 bg-green-500 transition-all duration-300 ease-out"
          style={{
            width: `${normalizedPercentage}%`,
            minWidth: normalizedPercentage > 0 ? '2px' : '0px',
          }}
        />
      </div>
      <div className="mt-1.5 text-xs text-gray-600 text-right font-medium">
        {normalizedPercentage}%
      </div>
    </div>
  );
}

