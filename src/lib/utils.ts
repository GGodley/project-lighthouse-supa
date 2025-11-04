import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getURL = () => {
  let url =
    process.env.NEXT_PUBLIC_VERCEL_URL || // Vercel's preview URL
    process.env.NEXT_PUBLIC_SITE_URL ||   // Your production URL
    'http://localhost:3000/';

  // Make sure to include `https://`
  url = url.includes('http') ? url : `https://${url}`;

  // Remove trailing slash
  url = url.replace(/\/$/, '');

  return url;
};
