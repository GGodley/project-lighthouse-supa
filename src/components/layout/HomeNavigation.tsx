'use client'

import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigationItems = {
  Platform: [
    { name: 'Refer a team', href: '#' },
    { name: 'Changelog', href: '#' },
    { name: 'Gmail extension', href: '#' },
    { name: 'iOS app', href: '#' },
    { name: 'Android app', href: '#' },
    { name: 'Security', href: '#' },
  ],
  Company: [
    { name: 'Customers', href: '#' },
    { name: 'Announcements', href: '#' },
    { name: 'Engineering blog', href: '#' },
    { name: 'Careers', href: '#' },
    { name: 'Manifesto', href: '#' },
    { name: 'Become a partner', href: '#' },
  ],
  'Import from': [
    { name: 'Salesforce', href: '#' },
    { name: 'Hubspot', href: '#' },
    { name: 'Pipedrive', href: '#' },
    { name: 'Zoho', href: '#' },
    { name: 'Excel', href: '#' },
    { name: 'CSV', href: '#' },
  ],
  'Lighthouse for': [
    { name: 'Startups', href: '#' },
    { name: 'Deal flow', href: '#' },
  ],
  Apps: [
    { name: 'Gmail', href: '#' },
    { name: 'Outlook', href: '#' },
    { name: 'Segment', href: '#' },
    { name: 'Mailchimp', href: '#' },
    { name: 'Slack', href: '#' },
    { name: 'Outreach', href: '#' },
    { name: 'Mixmax', href: '#' },
    { name: 'Typeform', href: '#' },
    { name: 'Zapier', href: '#' },
  ],
  Resources: [
    { name: 'Startup program', href: '#' },
    { name: 'Help center', href: '#' },
    { name: 'Automation templates', href: '#' },
    { name: 'Developers', href: '#' },
    { name: 'System status', href: '#' },
    { name: 'Hire an expert', href: '#' },
    { name: 'Downloads', href: '#' },
  ],
}

export default function HomeNavigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-header border-b border-white/20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold text-gray-900 no-underline">
            Lighthouse
          </Link>

          {/* Navigation Items */}
          <div className="hidden md:flex items-center space-x-1">
            {Object.entries(navigationItems).map(([label, items]) => (
              <DropdownMenu.Root key={label}>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={cn(
                      'flex items-center px-3 py-2 text-sm font-medium text-gray-700',
                      'hover:text-gray-900 transition-colors rounded-md',
                      'focus:outline-none focus:ring-2 focus:ring-gray-300'
                    )}
                  >
                    {label}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={cn(
                      'min-w-[200px] rounded-lg shadow-lg',
                      'bg-white border border-gray-200',
                      'py-2 z-50',
                      'opacity-0 data-[state=open]:opacity-100',
                      'transition-opacity duration-200'
                    )}
                    sideOffset={5}
                    align="start"
                  >
                    {items.map((item) => (
                      <DropdownMenu.Item key={item.name} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'block px-4 py-2 text-sm text-gray-700',
                            'hover:bg-gray-50 hover:text-gray-900',
                            'focus:outline-none focus:bg-gray-50',
                            'cursor-pointer no-underline'
                          )}
                          onClick={(e) => {
                            e.preventDefault()
                          }}
                        >
                          {item.name}
                        </Link>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors no-underline"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className={cn(
                'inline-flex items-center px-4 py-2 text-sm font-medium',
                'text-white bg-gray-900 rounded-md',
                'hover:bg-gray-800 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-gray-300',
                'no-underline'
              )}
            >
              Start for free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

