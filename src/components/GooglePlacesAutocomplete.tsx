'use client'

import { useEffect, useRef } from 'react'

interface GooglePlacesAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onVenueNameChange?: (venueName: string) => void // Callback för platsnamn
  placeholder?: string
  className?: string
  name?: string
}

export default function GooglePlacesAutocomplete({
  value,
  onChange,
  onVenueNameChange,
  placeholder = "Ange plats...",
  className = "",
  name
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.warn('Google Maps API key saknas - använder vanligt textfält')
      return
    }

    // Funktion för att initiera autocomplete
    const initAutocomplete = () => {
      if (!inputRef.current || autocompleteRef.current) return

      try {
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['establishment', 'geocode'],
          componentRestrictions: { country: 'se' },
          fields: ['formatted_address', 'name']
        })

        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current?.getPlace()
          if (place?.formatted_address) {
            onChange(place.formatted_address)
            
            // Skicka även platsnamnet om det finns
            if (onVenueNameChange && place.name) {
              onVenueNameChange(place.name)
            }
          }
        })
      } catch (error) {
        console.error('Fel vid skapande av Google Places Autocomplete:', error)
      }
    }

    // Kontrollera om Google Maps redan är laddat
    if (window.google?.maps?.places) {
      initAutocomplete()
      return
    }

    // Kontrollera om script redan finns
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      // Vänta på att Google Maps ska ladda
      const checkInterval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkInterval)
          initAutocomplete()
        }
      }, 100)

      // Timeout efter 10 sekunder
      setTimeout(() => clearInterval(checkInterval), 10000)
      return
    }

    // Ladda Google Maps script
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => {
      initAutocomplete()
    }
    script.onerror = () => {
      console.error('Kunde inte ladda Google Maps')
    }

    document.head.appendChild(script)

    return () => {
      if (autocompleteRef.current) {
        google.maps.event?.clearInstanceListeners?.(autocompleteRef.current)
      }
    }
  }, [onChange])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      name={name}
      value={value}
      onChange={handleInputChange}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  )
}

// Extend window för TypeScript
declare global {
  interface Window {
    google: any
  }
}
