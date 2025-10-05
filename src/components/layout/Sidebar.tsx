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
  UserSquare2,
  PieChart,
  Calendar
} from 'lucide-react'

const navigation = [
  { name: 'Current', href: '/dashboard', icon: BarChart3 },
  { name: 'Home', href: '/dashboard/home', icon: Home },
  { name: 'Customers', href: '/dashboard/customers', icon: UserSquare2 },
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

  return (
    <div className="flex flex-col w-64 bg-gray-900 text-white">
      <div className="flex items-center h-16 px-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Lighthouse</h1>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onSignOut}
          className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign out
        </button>
      </div>
    </div>
  )
}
