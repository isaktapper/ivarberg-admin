'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { Organizer } from '@/types/database'
import { cn } from '@/lib/utils'

interface OrganizerSearchableDropdownProps {
  organizers: Organizer[]
  value: number | null
  onChange: (organizerId: number | null) => void
  placeholder?: string
  excludeIds?: number[]
  showStatus?: boolean
  className?: string
}

/** Sökbar arrangörsväljare. Props-API oförändrat sedan tidigare. */
export default function OrganizerSearchableDropdown({
  organizers,
  value,
  onChange,
  placeholder = 'Välj arrangör…',
  excludeIds = [],
  showStatus = false,
  className = '',
}: OrganizerSearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOrganizer = organizers.find((org) => org.id === value)

  const filteredOrganizers = organizers
    .filter((org) => !excludeIds.includes(org.id))
    .filter((org) => org.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

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

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border border-line bg-white px-3 text-left text-sm hover:bg-sand-soft focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/20"
      >
        <span className="block min-w-0 truncate">
          {selectedOrganizer ? (
            <span className="flex items-center gap-2 font-medium text-ink">
              {selectedOrganizer.name}
              {showStatus && selectedOrganizer.status === 'pending' && <span className="text-xs text-amber">(väntar)</span>}
            </span>
          ) : (
            <span className="text-ink-faint">{placeholder}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selectedOrganizer && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Rensa val"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onChange(null)
                }
              }}
              className="rounded p-0.5 text-ink-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className={cn('size-4 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-[10000] mt-1 w-full overflow-hidden rounded-[10px] border border-line bg-white shadow-[var(--shadow-pop)]">
          <div className="border-b border-line p-2">
            <div className="flex h-9 items-center gap-2 rounded-[8px] border border-line px-2.5 focus-within:border-sea">
              <Search className="size-4 text-ink-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Sök arrangör…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
                autoFocus
              />
            </div>
          </div>
          <div className="thin-scroll max-h-56 overflow-y-auto py-1" role="listbox">
            {filteredOrganizers.length === 0 ? (
              <div className="px-3 py-3 text-center text-[13px] text-ink-muted">Ingen arrangör hittades</div>
            ) : (
              filteredOrganizers.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={org.id === value}
                  onClick={() => handleSelect(org.id)}
                  className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-sand-soft', org.id === value ? 'bg-sea-lightest font-medium text-ink' : 'text-ink')}
                >
                  <span className="truncate">{org.name}</span>
                  {showStatus && org.status === 'pending' && <span className="ml-2 text-xs text-amber">(väntar)</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
