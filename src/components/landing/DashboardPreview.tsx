import { 
  LayoutGrid, Users, Calendar, Video, CheckSquare, 
  MoreHorizontal, ArrowUpRight 
} from 'lucide-react'

export function DashboardPreview() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-2xl flex max-w-6xl mx-auto h-[600px] select-none pointer-events-none lg:pointer-events-auto">
      
      {/* 1. Mock Sidebar */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 hidden md:flex">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-6 h-6 bg-blue-600 rounded-md"></div>
          <span className="font-bold text-gray-900">Lighthouse</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 text-gray-900 rounded-md text-sm font-medium">
            <LayoutGrid className="w-4 h-4" /> Dashboard
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-gray-500 rounded-md text-sm font-medium">
            <Users className="w-4 h-4" /> Customers
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-gray-500 rounded-md text-sm font-medium">
            <Calendar className="w-4 h-4" /> Calendar
          </div>
        </div>
      </div>

      {/* 2. Mock Main Content */}
      <div className="flex-1 bg-white p-6 md:p-8 overflow-hidden relative">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900">Good afternoon, Sarah</h2>
          <p className="text-gray-500 text-sm">Here is what is happening with your customers today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Customers', val: '124', sub: '+12%', color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Happy Customers', val: '94%', sub: 'Positive', color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'At Risk', val: '3', sub: 'Action Needed', color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Meetings Today', val: '5', sub: 'Busy Day', color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map((stat, i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{stat.val}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stat.bg} ${stat.color}`}>{stat.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Meetings List (Span 2) */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Upcoming Meetings</h3>
            {[
              { title: 'TechFlow: Q1 Business Review', time: '10:00 AM', platform: 'Google Meet' },
              { title: 'Acme Corp: Renewal Discussion', time: '1:00 PM', platform: 'Zoom' },
              { title: 'Stark Ind: Onboarding Kickoff', time: '3:30 PM', platform: 'Teams' },
            ].map((m, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                 <div className="w-12 h-12 bg-blue-50 rounded-lg flex flex-col items-center justify-center text-blue-600 border border-blue-100">
                    <span className="text-[10px] font-bold uppercase">Jan</span>
                    <span className="text-lg font-bold leading-none">24</span>
                 </div>
                 <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-sm">{m.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                       <Video className="w-3 h-3" /> {m.platform} • {m.time}
                    </div>
                 </div>
                 <div className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide rounded-md">
                    Record On
                 </div>
              </div>
            ))}
          </div>

          {/* Tasks (Span 1) */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Priority Tasks</h3>
            {[
              { title: 'Review Contract Draft', label: 'TechFlow', tag: 'High' },
              { title: 'Schedule Executive Sync', label: 'Acme Corp', tag: 'Med' },
            ].map((t, i) => (
              <div key={i} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                     <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">SJ</div>
                     <span className="text-xs font-bold text-gray-900">Sarah J.</span>
                  </div>
                  <MoreHorizontal className="w-4 h-4 text-gray-300" />
                </div>
                <h4 className="font-bold text-sm text-gray-900 mb-1">{t.title}</h4>
                <p className="text-xs text-gray-500 mb-3">{t.label}</p>
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.tag} Priority</span>
                   <button className="text-blue-600 hover:text-blue-700">
                      <ArrowUpRight className="w-4 h-4" />
                   </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fade overlay at bottom to suggest 'more content' */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
      </div>
    </div>
  )
}

