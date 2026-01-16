'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold tracking-tight text-gray-900 no-underline">
            Lighthouse
          </Link>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="#"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Product
            </Link>
            <Link
              href="#"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Solutions
            </Link>
            <Link
              href="#"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Resources
            </Link>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className={cn(
                'inline-flex items-center justify-center px-6 py-2 text-sm font-medium',
                'text-white bg-gray-900 rounded-full',
                'hover:bg-gray-800 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                'no-underline'
              )}
            >
              Try for free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

