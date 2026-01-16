import { Eye, BrainCircuit, Zap } from 'lucide-react'

export function ThreePillarsSection() {
  const pillars = [
    {
      icon: Eye,
      title: "Total Lifecycle Visibility",
      subtitle: "See the Whole Story, Not Just the Signals.",
      description: "Stop jumping between tabs. We unify your CRM, support tickets, and product usage into a single, real-time 'Health Score 2.0.' Know exactly where every customer stands at a glance."
    },
    {
      icon: BrainCircuit,
      title: "Predictive Intelligence",
      subtitle: "Identify Churn and Expansion Before They Happen.",
      description: "Our AI doesn't just report on the past; it forecasts the future. Get alerted to 'silent churn' patterns and 'expansion-ready' signals weeks before they hit your radar."
    },
    {
      icon: Zap,
      title: "Automated Orchestration",
      subtitle: "Personalized Journeys at Unlimited Scale.",
      description: "High-touch service for every account. Our AI assistant triggers personalized playbooks and outreach based on real-time behavior, ensuring no customer is ever left behind."
    }
  ]

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-3">
            THE 3 PILLARS
          </h2>
          <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
            From Tracking to Orchestrating
          </h3>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            We aren't just a dashboard. We're your active partner in driving revenue.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillars.map((pillar, idx) => (
            <div 
              key={idx} 
              className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition-shadow duration-300"
            >
              {/* Icon */}
              <div className="w-14 h-14 bg-gray-200/50 rounded-xl flex items-center justify-center mb-8 text-gray-900">
                <pillar.icon className="w-7 h-7" strokeWidth={1.5} />
              </div>
              
              {/* Content */}
              <h4 className="text-xl font-bold text-gray-900 mb-2">
                {pillar.title}
              </h4>
              <p className="text-sm font-bold text-gray-900 mb-4">
                {pillar.subtitle}
              </p>
              <p className="text-gray-500 leading-relaxed">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

