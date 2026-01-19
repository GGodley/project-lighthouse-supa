'use client'

import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { 
  Users, Briefcase, Box, RefreshCw, BrainCircuit, PieChart,
  Cpu, Activity, Zap, CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SolutionsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Section A: Hero */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            Complete Customer visibility
          </h1>
          <p className="text-xl text-gray-500 max-w-3xl mx-auto mb-10">
            From data collection to AI-powered insights, Lighthouse transforms customer success experience across every touchpoint in your organization.
          </p>
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
            Start your free trial
          </Link>
        </div>
      </section>

      {/* Section B: Stakeholders */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-3">
              BUILT FOR ALL STAKEHOLDERS
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-6 max-w-3xl mx-auto">
              Whether you&apos;re managing accounts, leading teams, or driving product strategy, our platform adapts to your role.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mx-auto mb-6 text-gray-900">
                <Users className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Customer Success Managers</h3>
              <p className="text-gray-500 leading-relaxed">
                Get complete visibility into customer health, automate routine tasks, and focus on building relationships that drive retention and growth.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mx-auto mb-6 text-gray-900">
                <Briefcase className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Team Leads</h3>
              <p className="text-gray-500 leading-relaxed">
                Monitor team performance, identify coaching opportunities, and ensure consistent execution across your customer success organization.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mx-auto mb-6 text-gray-900">
                <Box className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Product Managers</h3>
              <p className="text-gray-500 leading-relaxed">
                Understand customer usage patterns, identify feature gaps, and prioritize product roadmap based on real customer feedback and behavior.
              </p>
            </div>
          </div>

          <div className="text-center">
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
              Start your free trial
            </Link>
          </div>
        </div>
      </section>

      {/* Section C: Comprehensive Capabilities */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-6">
              Comprehensive Platform Capabilities
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              Everything you need to manage customer relationships, predict outcomes, and drive growth.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {/* Unified Data Sync */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <RefreshCw className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Unified Data Sync</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Seamlessly sync all calls, emails, and tickets into one platform. No more scattered data across multiple tools—everything in one place.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Real-time synchronization</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Multi-platform integration</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Automated data cleaning</span>
                </li>
              </ul>
            </div>

            {/* AI-Powered Insights */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <BrainCircuit className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">AI-Powered Insights</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Summarize all interactions to give you an overview of customer health, sentiment, next steps, and actionable recommendations powered by AI.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Sentiment analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Churn prediction</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Smart recommendations</span>
                </li>
              </ul>
            </div>

            {/* Cross-Org Analytics */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <PieChart className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Cross-Org Analytics</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Build comprehensive analytics to identify trends, feature gaps, and opportunities across your entire organization for strategic insights.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Custom dashboards</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Trend analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Performance metrics</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className={cn(
                'inline-flex items-center justify-center px-8 py-4 text-lg font-bold',
                'text-gray-900 bg-white border border-gray-200 rounded-full',
                'hover:bg-gray-50 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                'no-underline'
              )}
            >
              Try all features free
            </Link>
          </div>
        </div>
      </section>

      {/* Section D: Advanced Features */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-6">
              Advanced Customer Success Features
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              Take your customer success to the next level with our advanced AI-driven capabilities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {/* AI Account Intelligence */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <Cpu className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">AI Account Intelligence</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Advanced algorithms analyze customer behavior and engagement to predict churn risk before it happens, giving you time to act.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Risk scoring algorithms</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Behavioral pattern analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Early warning alerts</span>
                </li>
              </ul>
            </div>

            {/* Analytics Dashboard */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <Activity className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Analytics Dashboard</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Real-time insights into customer health, revenue trends, and key product indicators that matter most to your business.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Revenue forecasting</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Health score tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Custom KPI monitoring</span>
                </li>
              </ul>
            </div>

            {/* Smart Automation */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-6 text-gray-900">
                <Zap className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Smart Automation</h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                Intelligent workflows that trigger personalized actions based on customer behavior and lifecycle stage to maximize retention.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Trigger-based workflows</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Personalized outreach</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-900 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">Lifecycle optimization</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-center">
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
              Start free trial today
            </Link>
          </div>
        </div>
      </section>

      {/* Section E: Scalability */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-6">
              Solutions That Scale With Your Company
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              From early-stage startups to global enterprises, our platform grows with your business needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Startups</h3>
              <p className="text-gray-500 leading-relaxed">
                Perfect for growing teams that need powerful insights without complexity or high costs.
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Scale-ups</h3>
              <p className="text-gray-500 leading-relaxed">
                Streamline operations and maintain quality as you rapidly expand your customer base.
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Mid-Market</h3>
              <p className="text-gray-500 leading-relaxed">
                Advanced workflows and integrations for established companies with complex needs.
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Enterprise</h3>
              <p className="text-gray-500 leading-relaxed">
                Enterprise-grade security, compliance, and scalability for global organizations.
              </p>
            </div>
          </div>

          {/* Final CTA Group */}
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
              Get started now
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
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

