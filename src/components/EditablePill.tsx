'use client'

import React, { useState, useRef, useEffect } from 'react'

interface EditablePillProps {
  label: string
  value: string | null
  options?: Array<{ value: string; label: string; className: string }>
  onChange: (value: string | null) => Promise<void>
  isReadOnly?: boolean
  placeholder?: string
  isLoading?: boolean
}

const EditablePill: React.FC<EditablePillProps> = ({
  value,
  options,
  onChange,
  isReadOnly = false,
  placeholder = 'Not Set',
  isLoading = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const pillRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        pillRef.current &&
        !pillRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setInputValue(value || '')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, value])

  const handleOptionClick = async (optionValue: string) => {
    if (isReadOnly || isUpdating) return

    setIsUpdating(true)
    try {
      await onChange(optionValue)
      setIsOpen(false)
    } catch (error) {
      console.error('Error updating pill:', error)
      // Revert input value on error
      setInputValue(value || '')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isReadOnly || isUpdating) return

    setIsUpdating(true)
    try {
      const newValue = inputValue.trim() || null
      await onChange(newValue)
      setIsOpen(false)
    } catch (error) {
      console.error('Error updating pill:', error)
      setInputValue(value || '')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setInputValue(value || '')
    }
  }

  const displayValue = value || placeholder
  const isNotSet = !value
  const baseClasses = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all'

  // Get pill styling based on state and value
  const getPillClasses = () => {
    if (isReadOnly) {
      return `${baseClasses} bg-gray-100 text-gray-800 border-gray-200 cursor-default`
    }
    
    // If value exists and we have options, find the matching option's className
    if (value && options) {
      const matchingOption = options.find(opt => opt.value === value)
      if (matchingOption) {
        return `${baseClasses} cursor-pointer hover:shadow-md ${matchingOption.className}`
      }
    }
    
    // Default styling based on state
    if (isNotSet) {
      return `${baseClasses} cursor-pointer bg-gray-50 text-gray-500 border-gray-200`
    }
    
    // For owner or other text values, use default styling
    return `${baseClasses} cursor-pointer hover:shadow-md bg-purple-50 text-purple-700 border-purple-200`
  }

  // Calculate popup position (above the pill)
  const getPopupPosition = () => {
    if (!pillRef.current) return {}
    const rect = pillRef.current.getBoundingClientRect()
    return {
      bottom: `${window.innerHeight - rect.top + 8}px`,
      left: `${rect.left}px`
    }
  }

  if (isReadOnly) {
    return (
      <span className={getPillClasses()}>
        {displayValue}
      </span>
    )
  }

  return (
    <div ref={pillRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !isUpdating && setIsOpen(!isOpen)}
        disabled={isUpdating || isLoading}
        className={getPillClasses()}
      >
        {isUpdating || isLoading ? (
          <span className="flex items-center gap-1">
            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
            Updating...
          </span>
        ) : (
          displayValue
        )}
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[200px]"
          style={getPopupPosition()}
        >
          {options ? (
            // Dropdown options (for Priority)
            <div className="space-y-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleOptionClick(option.value)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold transition-all hover:bg-gray-50 ${option.className}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            // Text input (for Owner)
            <form onSubmit={handleInputSubmit} className="space-y-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Enter owner name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                maxLength={255}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    setInputValue(value || '')
                  }}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export default EditablePill

