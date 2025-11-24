'use client'

import HomeNavigation from '@/components/layout/HomeNavigation'
import Typewriter from '@/components/ui/Typewriter'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <HomeNavigation />
      
      {/* Hero Section */}
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-center py-20">
            {/* Animated Title */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-8 leading-tight max-w-5xl">
              <Typewriter 
                text="Customer insight guiding data driven product decision" 
                speed={50}
              />
            </h1>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl font-normal">
              Lighthouse is the AI-native platform for product teams.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={(e) => {
                  e.preventDefault()
                }}
                className="inline-flex items-center justify-center px-8 py-3 text-base font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 min-w-[160px]"
              >
                Start for free
              </button>
              
              <button
                onClick={(e) => {
                  e.preventDefault()
                }}
                className="inline-flex items-center justify-center px-8 py-3 text-base font-medium text-gray-900 bg-white border-2 border-gray-900 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 min-w-[160px]"
              >
                Talk to sales
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
