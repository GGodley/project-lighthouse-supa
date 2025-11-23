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
  MessageSquare,
  Sun,
  Moon
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

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
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

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
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/20">
        <h1 className="text-xl font-bold text-gray-900">Lighthouse</h1>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-white/30 transition-colors"
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          <div className="relative w-8 h-5 flex items-center">
            {/* Track */}
            <div className={`absolute inset-0 rounded-full transition-colors ${
              isDark 
                ? 'bg-gray-700' 
                : 'bg-gray-300'
            }`} />
            
            {/* Slider */}
            <div className={`absolute w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300 ${
              isDark 
                ? 'translate-x-4' 
                : 'translate-x-0.5'
            }`} />
            
            {/* Icons */}
            <div className="relative w-full h-full flex items-center justify-between px-1 pointer-events-none">
              <Sun className={`w-3 h-3 transition-opacity ${
                isDark ? 'opacity-0' : 'opacity-100 text-yellow-500'
              }`} />
              <Moon className={`w-3 h-3 transition-opacity ${
                isDark ? 'opacity-100 text-blue-300' : 'opacity-0'
              }`} />
            </div>
          </div>
        </button>
      </div>
      
      <nav className="flex-1 px-3 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = isRouteActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'relative flex items-center px-4 py-3 text-sm rounded-xl transition-all no-underline',
                isActive
                  ? 'glass-card font-semibold text-gray-900 shadow-md'
                  : 'text-gray-800 hover:text-gray-900 hover:bg-white/30'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 mr-3 flex-shrink-0',
                isActive ? 'text-gray-900' : 'text-gray-700'
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
