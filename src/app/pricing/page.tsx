'use client'

import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-500 max-w-3xl mx-auto">
            One platform, one price. Scale your customer success with transparent pricing that grows with your team.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Professional Card */}
            <div className="relative border-2 border-gray-900 rounded-2xl p-8 shadow-xl">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-gray-900 text-white text-xs font-bold px-4 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
              
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Professional</h3>
                <p className="text-gray-500 mb-6">Perfect for growing teams</p>
                
                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-gray-900">$20</span>
                    <span className="text-gray-500">/user/month</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Billed monthly</p>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Unlimited customer profiles</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">AI-powered interaction summaries</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Real-time analytics dashboard</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Email, call & ticket sync</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Sentiment analysis</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Churn prediction</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                    <span className="text-gray-700">24/7 support</span>
                  </li>
                </ul>

                <Link
                  href="/login"
                  className={cn(
                    'w-full inline-flex items-center justify-center px-8 py-4 text-lg font-bold',
                    'text-white bg-gray-900 rounded-full',
                    'hover:bg-gray-800 transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                    'no-underline mb-3'
                  )}
                >
                  Start free trial
                </Link>
                <p className="text-xs text-gray-500 text-center">
                  14-day free trial • No credit card required
                </p>
              </div>
            </div>

            {/* Enterprise Card */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Enterprise</h3>
              <p className="text-gray-500 mb-6">For large organizations</p>
              
              <div className="mb-8">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-gray-900">Custom</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">Volume discounts available</p>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Everything in Professional</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Advanced security & compliance</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Custom integrations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Dedicated customer success manager</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Priority support</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Custom reporting</span>
                </li>
              </ul>

              <Link
                href="#"
                className={cn(
                  'w-full inline-flex items-center justify-center px-8 py-4 text-lg font-bold',
                  'text-gray-900 bg-white border border-gray-200 rounded-full',
                  'hover:bg-gray-50 transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                  'no-underline'
                )}
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 text-center mb-16">
            Frequently asked questions
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-4xl mx-auto">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                What&apos;s included in the free trial?
              </h3>
              <p className="text-gray-500 leading-relaxed">
                Full access to all Professional features for 14 days. No credit card required.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Can I change plans anytime?
              </h3>
              <p className="text-gray-500 leading-relaxed">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-500 leading-relaxed">
                We accept all major credit cards and can arrange invoicing for Enterprise customers.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                How does billing work?
              </h3>
              <p className="text-gray-500 leading-relaxed">
                You&apos;re billed monthly based on the number of active users. Add or remove users anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-4">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Join hundreds of teams already using Lighthouse to transform their customer success.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
              Start free trial
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
              Contact sales
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

