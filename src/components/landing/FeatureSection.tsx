import { CheckCircle2 } from 'lucide-react'
import { DashboardPreview } from '@/components/landing/DashboardPreview'

export function FeatureSection() {
  const benefits = [
    "Prepares detailed meeting briefs automatically",
    "Drafts the 'perfect' next-step email",
    "Keeps the engine running 24/7"
  ]

  return (
    <section className="py-32 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Text Content */}
          <div>
            <p className="text-sm font-bold tracking-widest text-gray-900 uppercase mb-4">
              HUMAN + AI
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
              Your CSMs, Augmented.
            </h2>
            <p className="text-lg text-gray-500 leading-relaxed mb-8">
              While the AI handles the data-crunching, health monitoring, and administrative grunt work, your team focuses on what they do best: building strategic partnerships.
            </p>
            
            <ul className="space-y-4">
              {benefits.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-gray-900 shrink-0" />
                  <span className="text-base font-medium text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual Side */}
          <div className="relative">
            <DashboardPreview />
          </div>

        </div>
      </div>
    </section>
  )
}

