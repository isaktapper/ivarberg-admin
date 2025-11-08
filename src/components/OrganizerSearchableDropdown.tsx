'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { Organizer } from '@/types/database'

interface OrganizerSearchableDropdownProps {
  organizers: Organizer[]
  value: number | null
  onChange: (organizerId: number | null) => void
  placeholder?: string
  excludeIds?: number[]
  showStatus?: boolean
  className?: string
}

export default function OrganizerSearchableDropdown({
  organizers,
  value,
  onChange,
  placeholder = 'Välj organizer...',
  excludeIds = [],
  showStatus = false,
  className = ''
}: OrganizerSearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOrganizer = organizers.find(org => org.id === value)
  
  const filteredOrganizers = organizers
    .filter(org => !excludeIds.includes(org.id))
    .filter(org => 
      org.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (organizerId: number) => {
    onChange(organizerId)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 hover:bg-gray-50"
      >
        <span className="block truncate">
          {selectedOrganizer ? (
            <span className="flex items-center gap-2">
              {selectedOrganizer.name}
              {showStatus && selectedOrganizer.status === 'pending' && (
                <span className="text-xs text-amber-600">(Pending)</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {selectedOrganizer && (
            <X
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[10000] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Sök organizer..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                autoFocus
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOrganizers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                Ingen organizer hittades
              </div>
            ) : (
              filteredOrganizers.map(org => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelect(org.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center justify-between ${
                    org.id === value ? 'bg-purple-100 text-purple-900' : 'text-gray-900'
                  }`}
                >
                  <span className="truncate">{org.name}</span>
                  {showStatus && org.status === 'pending' && (
                    <span className="text-xs text-amber-600 ml-2">(Pending)</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}



