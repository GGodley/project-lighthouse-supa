'use client';

import React from 'react';

interface HealthScoreBarProps {
  score: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}

export default function HealthScoreBar({ 
  score, 
  showLabel = true,
  className = '' 
}: HealthScoreBarProps) {
  // Handle null, undefined, or out of range scores
  const normalizedScore = score === null || score === undefined 
    ? 0 
    : Math.max(-100, Math.min(100, score));
  
  // Calculate percentage for bar width (0 to 100%)
  // For negative scores, bar extends left from center
  // For positive scores, bar extends right from center
  const isNegative = normalizedScore < 0;
  const isPositive = normalizedScore > 0;
  const isNeutral = normalizedScore === 0;
  
  // Calculate bar width (0-50% for negative, 0-50% for positive)
  const barWidth = Math.abs(normalizedScore) / 2; // Divide by 2 because max is 100, and we want 50% max per side
  
  // Determine color based on score
  const getBarColor = () => {
    if (isNeutral) return 'bg-yellow-400';
    if (isNegative) {
      // Red gradient: darker red for more negative
      if (normalizedScore <= -75) return 'bg-red-700';
      if (normalizedScore <= -50) return 'bg-red-600';
      if (normalizedScore <= -25) return 'bg-red-500';
      return 'bg-red-400';
    } else {
      // Green gradient: darker green for more positive
      if (normalizedScore >= 75) return 'bg-green-700';
      if (normalizedScore >= 50) return 'bg-green-600';
      if (normalizedScore >= 25) return 'bg-green-500';
      return 'bg-green-400';
    }
  };
  
  const barColor = getBarColor();
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <span className="text-sm font-medium text-gray-700 min-w-[60px]">
          {normalizedScore > 0 ? '+' : ''}{normalizedScore}
        </span>
      )}
      <div className="flex-1 relative h-6 bg-gray-200 rounded-full overflow-hidden">
        {/* Center line indicator */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-yellow-500 z-10 transform -translate-x-1/2" />
        
        {/* Negative bar (extends left from center) */}
        {isNegative && (
          <div
            className={`absolute right-1/2 top-0 bottom-0 ${barColor} transition-all duration-300`}
            style={{
              width: `${barWidth}%`,
              right: '50%',
            }}
          />
        )}
        
        {/* Positive bar (extends right from center) */}
        {isPositive && (
          <div
            className={`absolute left-1/2 top-0 bottom-0 ${barColor} transition-all duration-300`}
            style={{
              width: `${barWidth}%`,
            }}
          />
        )}
        
        {/* Neutral indicator (small dot at center) */}
        {isNeutral && (
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-500 rounded-full z-20" />
        )}
      </div>
    </div>
  );
}

