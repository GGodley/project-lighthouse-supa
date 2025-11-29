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
  
  // Get gradient colors based on score intensity
  const getGradient = () => {
    if (isNeutral) {
      return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    }
    if (isNegative) {
      const absScore = Math.abs(normalizedScore);
      if (absScore >= 75) {
        return 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
      } else if (absScore >= 50) {
        return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      } else if (absScore >= 25) {
        return 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)';
      } else {
        return 'linear-gradient(135deg, #fca5a5 0%, #f87171 100%)';
      }
    } else {
      const absScore = Math.abs(normalizedScore);
      if (absScore >= 75) {
        return 'linear-gradient(135deg, #059669 0%, #047857 100%)';
      } else if (absScore >= 50) {
        return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      } else if (absScore >= 25) {
        return 'linear-gradient(135deg, #34d399 0%, #10b981 100%)';
      } else {
        return 'linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)';
      }
    }
  };

  // Get bubble color and glow
  const getBubbleStyle = () => {
    if (isNeutral) {
      return {
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        boxShadow: '0 0 8px rgba(245, 158, 11, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      };
    }
    if (isNegative) {
      return {
        background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)',
        boxShadow: '0 0 8px rgba(239, 68, 68, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      };
    } else {
      return {
        background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
        boxShadow: '0 0 8px rgba(16, 185, 129, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      };
    }
  };
  
  const gradient = getGradient();
  const bubbleStyle = getBubbleStyle();
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showLabel && (
        <span className="health-score-label text-sm font-semibold min-w-[60px] tabular-nums">
          {normalizedScore > 0 ? '+' : ''}{normalizedScore}
        </span>
      )}
      <div 
        className="health-score-bar-container flex-1 relative h-2.5 rounded-full overflow-hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(0, 0, 0, 0.2)',
          boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        }}
      >
        {/* Center line indicator (subtle and elegant) */}
        <div 
          className="health-score-center-line absolute left-1/2 top-0 bottom-0 z-10 transform -translate-x-1/2"
          style={{
            width: '1px',
            background: 'rgba(0, 0, 0, 0.1)',
          }}
        />
        
        {/* Negative bar (extends left from center) */}
        {isNegative && (
          <div
            className="absolute right-1/2 top-0 bottom-0 rounded-full"
            style={{
              width: `${barWidth}%`,
              right: '50%',
              background: gradient,
              boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}
        
        {/* Positive bar (extends right from center) */}
        {isPositive && (
          <div
            className="absolute left-1/2 top-0 bottom-0 rounded-full"
            style={{
              width: `${barWidth}%`,
              background: gradient,
              boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}
        
        {/* Neutral indicator (bubble at center for zero) */}
        {isNeutral && (
          <div 
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full z-20"
            style={{
              width: '10px',
              height: '10px',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              ...bubbleStyle,
            }}
          />
        )}
        
        {/* Moving bubble indicator for non-zero scores (spirit level style) */}
        {!isNeutral && (
          <div 
            className="absolute top-1/2 rounded-full z-20"
            style={{
              left: `${50 + (normalizedScore / 2)}%`,
              transform: 'translate(-50%, -50%)',
              width: '10px',
              height: '10px',
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              ...bubbleStyle,
            }}
          />
        )}
      </div>
    </div>
  );
}

