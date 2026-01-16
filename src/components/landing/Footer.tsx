import Link from 'next/link'
import { Twitter, Linkedin, Github } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Footer() {
  return (
    <footer className="bg-gray-50 pt-24 pb-12 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* 1. Big CTA Section */}
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-4">
            Ready to turn your CS team into a Growth Org?
          </h2>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Join the industry leaders using AI to dominate the customer lifecycle.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className={cn(
                'inline-flex items-center justify-center px-8 py-3 text-base font-bold',
                'text-white bg-gray-900 rounded-full',
                'hover:bg-gray-800 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                'no-underline'
              )}
            >
              Start for free
            </Link>
            <Link
              href="#"
              className={cn(
                'inline-flex items-center justify-center px-8 py-3 text-base font-bold',
                'text-gray-900 bg-white border border-gray-200 rounded-full',
                'hover:bg-gray-50 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2',
                'no-underline'
              )}
            >
              Book a demo
            </Link>
          </div>
        </div>

        {/* 2. Bottom Links */}
        <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo & Copyright */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
              {/* Tiny icon placeholder */}
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            <span className="font-bold text-gray-900 text-sm">Lighthouse</span>
            <span className="text-gray-400 text-sm ml-4">
              © {new Date().getFullYear()} Lighthouse Inc.
            </span>
          </div>

          {/* Socials */}
          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-400 hover:text-gray-900 transition-colors" aria-label="Twitter">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-900 transition-colors" aria-label="LinkedIn">
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-900 transition-colors" aria-label="GitHub">
              <Github className="w-5 h-5" />
            </a>
          </div>
          
        </div>
      </div>
    </footer>
  )
}

