import { describe, expect, it } from 'vitest'
import { appendUserLocation } from '@/gemini/systemInstructions'

const BASE = 'lucy-system-prompt-base'

describe('appendUserLocation', () => {
  it('returns the base string unchanged when no location is supplied', () => {
    expect(appendUserLocation(BASE, null)).toBe(BASE)
    expect(appendUserLocation(BASE, undefined)).toBe(BASE)
  })

  it('returns base unchanged when coords are non-finite', () => {
    expect(
      appendUserLocation(BASE, { lat: Number.NaN, lng: 0 }),
    ).toBe(BASE)
    expect(
      appendUserLocation(BASE, { lat: 0, lng: Number.POSITIVE_INFINITY }),
    ).toBe(BASE)
  })

  it('appends the EN block with label and coords when provided', () => {
    const out = appendUserLocation(
      BASE,
      { lat: 19.4326, lng: -99.1332, label: 'Mexico City, Mexico' },
      'en',
    )
    expect(out.startsWith(BASE)).toBe(true)
    expect(out).toContain('USER LOCATION CONTEXT')
    expect(out).toContain('Mexico City, Mexico (lat=19.432600, lng=-99.133200)')
    expect(out).toContain('search_places_nearby')
  })

  it('falls back to coords-only phrasing when label is empty', () => {
    const out = appendUserLocation(BASE, { lat: 1.23, lng: 4.56 }, 'en')
    expect(out).toContain('lat=1.230000, lng=4.560000')
    expect(out).not.toContain('current location:')
  })

  it('emits the ES block when language=es', () => {
    const out = appendUserLocation(
      BASE,
      { lat: 19.4326, lng: -99.1332, label: 'Ciudad de México' },
      'es',
    )
    expect(out).toContain('CONTEXTO DE UBICACIÓN DEL USUARIO')
    expect(out).toContain('Ciudad de México')
    expect(out).toContain('search_places_nearby con estas coordenadas exactas')
  })

  it('does not duplicate when called with the same base twice (caller responsibility)', () => {
    // Sanity: the helper is purely additive; the caller is expected to call
    // it once per session against the unmodified base prompt. Two calls
    // should produce two appended blocks (we are not deduping).
    const once = appendUserLocation(BASE, { lat: 1, lng: 2 }, 'en')
    const twice = appendUserLocation(once, { lat: 3, lng: 4 }, 'en')
    const occurrences = (twice.match(/USER LOCATION CONTEXT/g) ?? []).length
    expect(occurrences).toBe(2)
  })
})
