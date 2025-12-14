'use client';

import { useGmailSync } from '@/hooks/useGmailSync';

interface SyncButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * SyncButton component
 * 
 * A button that triggers Gmail sync using the useGmailSync hook.
 * Shows loading state and handles errors gracefully.
 */
export default function SyncButton({ 
  className = '', 
  variant = 'default',
  size = 'md'
}: SyncButtonProps) {
  const { triggerSync, isSyncing, error } = useGmailSync();

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  // Variant classes
  const variantClasses = {
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
    outline: 'border border-gray-300 hover:bg-gray-50 text-gray-700',
    ghost: 'hover:bg-gray-100 text-gray-700',
  };

  const baseClasses = 'rounded-md font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={triggerSync}
        disabled={isSyncing}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        aria-label={isSyncing ? 'Syncing...' : 'Sync Now'}
      >
        {isSyncing ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Syncing...
          </span>
        ) : (
          'Sync Now'
        )}
      </button>
      {error && (
        <p className="text-sm text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

