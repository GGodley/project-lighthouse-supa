'use client'

import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import { FeatureSection } from '@/components/landing/FeatureSection'
import { DashboardPreview } from '@/components/landing/DashboardPreview'
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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
              <Link
                href="/login"
                className={cn(
                  'inline-flex items-center justify-center px-8 py-4 text-lg font-bold',
                  'text-white bg-gray-900 rounded-full',
                  'hover:bg-gray-800 transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                  'no-underline'
                )}
              >
                Start for free
              </Link>
              
              <Link
                href="#"
                className={cn(
                  'inline-flex items-center justify-center px-8 py-4 text-lg font-bold',
                  'text-gray-900 bg-white border border-gray-200 rounded-full',
                  'hover:bg-gray-50 transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                  'no-underline'
                )}
              >
                Book a demo
              </Link>
            </div>

            {/* HERO VISUAL - The Live Component */}
            <div className="relative mx-auto max-w-6xl transform transition-transform hover:scale-[1.01] duration-500">
              {/* Decorative blur glow behind the dashboard */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-100 to-purple-100 rounded-2xl blur-2xl opacity-50"></div>
              
              <div className="relative">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Feature Section */}
      <FeatureSection />
    </div>
  )
}
