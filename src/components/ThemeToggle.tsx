'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <button
      onClick={toggleTheme}
      className="glass-button fixed top-4 right-4 z-50 p-3 rounded-xl transition-all"
      style={{ marginRight: '1rem' }}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <div className="relative w-10 h-6 flex items-center">
        {/* Track */}
        <div className={`absolute inset-0 rounded-full transition-colors ${
          isDark 
            ? 'bg-gray-700' 
            : 'bg-gray-300'
        }`} />
        
        {/* Slider */}
        <div className={`absolute w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
          isDark 
            ? 'translate-x-5' 
            : 'translate-x-0.5'
        }`} />
        
        {/* Icons */}
        <div className="relative w-full h-full flex items-center justify-between px-1.5 pointer-events-none">
          <Sun className={`w-3.5 h-3.5 transition-opacity ${
            isDark ? 'opacity-0' : 'opacity-100 text-yellow-500'
          }`} />
          <Moon className={`w-3.5 h-3.5 transition-opacity ${
            isDark ? 'opacity-100 text-blue-300' : 'opacity-0'
          }`} />
        </div>
      </div>
    </button>
  )
}

