'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  Mail, 
  Settings, 
  LogOut,
  BarChart3,
  Home,
  PieChart,
  Calendar,
  MessageSquare
} from 'lucide-react'

const navigation = [
  { name: 'Current', href: '/dashboard', icon: BarChart3 },
  { name: 'Home', href: '/dashboard/home', icon: Home },
  { name: 'Customer Threads', href: '/dashboard/customer-threads', icon: MessageSquare },
  { name: 'Analytics', href: '/dashboard/analytics', icon: PieChart },
  { name: 'Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  onSignOut: () => void
}

export default function Sidebar({ onSignOut }: SidebarProps) {
  const pathname = usePathname()

  // Check if a route is active (handles nested routes like /dashboard/customer-threads/[id])
  const isRouteActive = (href: string) => {
    if (pathname === href) return true
    // For nested routes, check if pathname starts with the href
    // But exclude exact matches of parent routes (e.g., /dashboard shouldn't match /dashboard/customer-threads)
    if (href !== '/dashboard' && pathname.startsWith(href + '/')) return true
    return false
  }

  return (
    <div className="flex flex-col w-64 glass-header border-r border-white/20">
      <div className="flex items-center h-16 px-4 border-b border-white/20">
        <h1 className="text-xl font-bold text-gray-900">Lighthouse</h1>
      </div>
      
      <nav className="flex-1 px-3 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = isRouteActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'relative flex items-center px-4 py-3 text-sm rounded-xl transition-all',
                isActive
                  ? 'glass-card font-semibold text-gray-900 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/30'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 mr-3 flex-shrink-0',
                isActive ? 'text-gray-900' : 'text-gray-500'
              )} />
              <span className={cn(
                isActive ? 'font-semibold' : 'font-medium'
              )}>
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-white/20">
        <button
          onClick={onSignOut}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-white/30 hover:text-gray-900 transition-all"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign out
        </button>
      </div>
    </div>
  )
}
