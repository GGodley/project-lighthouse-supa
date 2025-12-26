'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { 
  Settings, 
  LogOut,
  BarChart3,
  Calendar,
  MessageSquare,
  Sun,
  Moon
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Customers', href: '/dashboard/customer-threads', icon: MessageSquare },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  onSignOut: () => void
}

export default function Sidebar({ onSignOut }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  // Check if a route is active (handles nested routes like /dashboard/customer-threads/[id])
  const isRouteActive = (href: string) => {
    if (pathname === href) return true
    // For nested routes, check if pathname starts with the href
    // But exclude exact matches of parent routes (e.g., /dashboard shouldn't match /dashboard/customer-threads)
    if (href !== '/dashboard' && pathname.startsWith(href + '/')) return true
    return false
  }

  return (
    <div className="flex flex-col w-64 glass-header border-r border-white/20 dark:border-white/10">
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/20 dark:border-white/10">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Lighthouse</h1>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-yellow-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          )}
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
                  ? 'glass-card font-semibold text-slate-800 dark:text-white bg-blue-100 dark:bg-blue-500/20 shadow-md'
                  : 'text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/10'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 mr-3 flex-shrink-0',
                isActive 
                  ? 'text-blue-700 dark:text-blue-300' 
                  : 'text-slate-600 dark:text-gray-400'
              )} />
              <span className={cn(
                isActive 
                  ? 'font-semibold text-blue-700 dark:text-blue-300' 
                  : 'font-medium text-slate-700 dark:text-gray-300'
              )}>
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-white/20 dark:border-white/10">
        <button
          onClick={onSignOut}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-xl hover:bg-white/30 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign out
        </button>
      </div>
    </div>
  )
}
