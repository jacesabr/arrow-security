'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

// Address autocomplete + lat/lng resolution backed by Google Places.
// Caller passes onPick which fires once the user selects a suggestion;
// the picked place's formatted address, lat/lng, and (when available) the
// short name are forwarded. Falls back to a plain text input if the API
// key isn't configured — better than disabling the form entirely.

export interface PlacePick {
  address: string
  latitude: number
  longitude: number
  /** Short name from Google (e.g. "TCS BKC Tower 1") if the picked result
   *  is a named place rather than just an address. Use to suggest a site
   *  name. Empty string when the pick is a pure address. */
  shortName: string
}

export interface GoogleAddressAutocompleteProps {
  value: string
  onChange: (value: string) => void          // typing — updates the address text only
  onPick: (place: PlacePick) => void         // user selected a suggestion
  placeholder?: string
  /** Bias results to a specific country (ISO 3166-1 alpha-2). Defaults to 'in'. */
  countryCode?: string
}

let loaderInstance: Loader | null = null
function getLoader(apiKey: string): Loader {
  if (loaderInstance) return loaderInstance
  loaderInstance = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places'],
  })
  return loaderInstance
}

export function GoogleAddressAutocomplete({
  value, onChange, onPick, placeholder, countryCode = 'in',
}: GoogleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

  useEffect(() => {
    if (!apiKey) {
      setLoadError('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — falling back to plain text input')
      return
    }
    let cancelled = false
    getLoader(apiKey)
      .importLibrary('places')
      .then(() => {
        if (cancelled || !inputRef.current) return
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'name'],
          componentRestrictions: countryCode ? { country: countryCode } : undefined,
        })
        acRef.current = ac
        ac.addListener('place_changed', () => {
          const place = ac.getPlace()
          const loc = place.geometry?.location
          if (!loc) return
          const formatted = place.formatted_address ?? inputRef.current?.value ?? ''
          onChange(formatted)
          onPick({
            address: formatted,
            latitude: loc.lat(),
            longitude: loc.lng(),
            shortName: place.name && place.name !== formatted ? place.name : '',
          })
        })
        setReady(true)
      })
      .catch((e: any) => {
        if (cancelled) return
        setLoadError(e?.message ?? 'Failed to load Google Maps Places library')
      })
    return () => { cancelled = true }
    // onPick/onChange identities aren't stable from parent renders; intentionally
    // skip them as deps so we don't re-init the Autocomplete every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, countryCode])

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Start typing the site address…'}
        // Browsers fire form-submit on Enter even when the user is just
        // accepting a suggestion. Block it; the click handler on the suggestion
        // is what actually completes the pick.
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
        style={{
          width: '100%', padding: '9px 12px',
          border: '1px solid #e8e5e0', borderRadius: 7,
          fontSize: 14, color: '#1a1916', background: '#ffffff',
          fontFamily: 'inherit',
        }}
      />
      {loadError && (
        <div style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 4 }}>
          {loadError}. Enter the address by hand and fill lat/lng manually below.
        </div>
      )}
      {!loadError && !ready && apiKey && (
        <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 4 }}>
          Loading Google Places…
        </div>
      )}
    </>
  )
}
