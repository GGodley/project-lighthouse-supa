'use client'

import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import { cn } from '@/lib/utils'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Hero Section */}
      <main className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            {/* Heading */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 mb-6">
              AI Powered Proactive customer success
            </h1>

            {/* Subtext */}
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
              Stop churn before it happens. Turn customer data into actionable growth opportunities with the intelligent platform built for modern CS teams.
            </p>

            {/* CTA Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link
                href="/login"
                className={cn(
                  'inline-flex items-center justify-center px-8 py-3 text-base font-medium',
                  'text-white bg-gray-900 rounded-lg',
                  'hover:bg-gray-800 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                  'no-underline'
                )}
              >
                Start for free
              </Link>
              
              <Link
                href="#"
                className={cn(
                  'inline-flex items-center justify-center px-8 py-3 text-base font-medium',
                  'text-gray-900 bg-white border border-gray-200 rounded-lg',
                  'hover:bg-gray-50 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                  'no-underline'
                )}
              >
                Book a demo
              </Link>
            </div>

            {/* Visual Placeholder - Dashboard Preview */}
            <div className="relative rounded-xl border border-gray-200 shadow-2xl bg-gray-50 overflow-hidden aspect-[16/9] mx-auto max-w-6xl w-full">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-400 text-lg font-medium mb-2">Dashboard Preview</div>
                  <div className="text-gray-300 text-sm">Visual interface coming soon</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
