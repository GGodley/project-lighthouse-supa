import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ArrowUpRight, Clock, AlertCircle, LucideIcon } from 'lucide-react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getURL = () => {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ?? // Set this to your new domain in Vercel Env Vars
    process.env.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel for previews
    'http://localhost:3000/'

  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`

  // Make sure to include a trailing `/`.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`

  return url
}

export interface SentimentData {
  category: 'Positive' | 'Neutral' | 'Negative';
  message: string;
  colors: {
    bg: string;
    border: string;
    text: string;
    icon: string;
  };
  icon: LucideIcon;
}

/**
 * Maps health_score to sentiment category, message, and styling
 * Health score ranges from -100 to 100
 * - Positive: health_score > 0
 * - Neutral: health_score === 0
 * - Negative: health_score < 0
 */
export function getSentimentFromHealthScore(healthScore: number | null): SentimentData | null {
  if (healthScore === null || healthScore === undefined) {
    return null;
  }

  if (healthScore > 0) {
    return {
      category: 'Positive',
      message: 'Customer shows high satisfaction with current services. Recent interactions indicate strong engagement and interest in expanding usage. No major concerns raised in recent communications, and a proactive, collaborative tone is often present.',
      colors: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-800',
        icon: 'text-green-600',
      },
      icon: ArrowUpRight,
    };
  } else if (healthScore < 0) {
    return {
      category: 'Negative',
      message: 'Customer displays significant dissatisfaction or frustration. Recent communications highlight unresolved support tickets, repeat issues, or negative feedback on product features or services. Engagement may be low or conversations show signs of irritation, indicating a high risk of churn that requires immediate attention.',
      colors: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-800',
        icon: 'text-red-600',
      },
      icon: AlertCircle,
    };
  } else {
    // healthScore === 0
    return {
      category: 'Neutral',
      message: 'Interactions with the customer are largely transactional and informational. Communications are stable, focusing on routine operations or standard queries. The AI detects no significant negative signals, but also lacks strong indicators of high satisfaction or enthusiastic engagement. This customer is stable but may represent an opportunity for proactive outreach.',
      colors: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-800',
        icon: 'text-yellow-600',
      },
      icon: Clock,
    };
  }
}
