import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLocationLabel,
  geocodeReverse,
  handleGeocodeReverse,
} from '../../server/geocodeProxy'

const SAMPLE_GEOCODE_RESPONSE = {
  status: 'OK',
  results: [
    {
      address_components: [
        { long_name: 'Cuauhtemoc', short_name: 'Cuauhtemoc', types: ['sublocality'] },
        { long_name: 'Mexico City', short_name: 'CDMX', types: ['locality', 'political'] },
        {
          long_name: 'Ciudad de Mexico',
          short_name: 'CDMX',
          types: ['administrative_area_level_1'],
        },
        { long_name: 'Mexico', short_name: 'MX', types: ['country', 'political'] },
      ],
      formatted_address: 'Mexico City, CDMX, Mexico',
      place_id: 'ChIJB3UJ2yYAzoURQeheJnYQBlQ',
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('buildLocationLabel', () => {
  it('builds a "locality, admin_area, country" label from address_components', () => {
    const label = buildLocationLabel(SAMPLE_GEOCODE_RESPONSE.results[0].address_components)
    expect(label).toBe('Mexico City, Ciudad de Mexico, Mexico')
  })

  it('falls back to sublocality when locality is absent', () => {
    const label = buildLocationLabel([
      { long_name: 'Williamsburg', types: ['sublocality'] },
      { long_name: 'New York', types: ['administrative_area_level_1'] },
      { long_name: 'United States', types: ['country'] },
    ])
    expect(label).toBe('Williamsburg, New York, United States')
  })

  it('de-dupes adjacent identical entries (city-state case)', () => {
    const label = buildLocationLabel([
      { long_name: 'Singapore', types: ['locality'] },
      { long_name: 'Singapore', types: ['administrative_area_level_1'] },
      { long_name: 'Singapore', types: ['country'] },
    ])
    expect(label).toBe('Singapore')
  })

  it('returns undefined when no relevant components exist', () => {
    expect(buildLocationLabel([])).toBeUndefined()
    expect(
      buildLocationLabel([{ long_name: 'Premise X', types: ['premise'] }]),
    ).toBeUndefined()
  })
})

describe('geocodeReverse', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns label + placeId on a successful geocode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_GEOCODE_RESPONSE))
    vi.stubGlobal('fetch', fetchMock)

    const result = await geocodeReverse(19.4326, -99.1332, 'es')

    expect(result.placeId).toBe('ChIJB3UJ2yYAzoURQeheJnYQBlQ')
    expect(result.label).toBe('Mexico City, Ciudad de Mexico, Mexico')
    expect(result.formatted).toBe('Mexico City, CDMX, Mexico')
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain('latlng=19.4326%2C-99.1332')
    expect(calledUrl).toContain('language=es')
    expect(calledUrl).toContain('key=test-key')
  })

  it('returns {} when the API returns ZERO_RESULTS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'ZERO_RESULTS', results: [] })),
    )
    const result = await geocodeReverse(0, 0)
    expect(result).toEqual({})
  })

  it('returns {} on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })))
    const result = await geocodeReverse(19.4, -99.1)
    expect(result).toEqual({})
  })

  it('returns {} on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network blip')))
    const result = await geocodeReverse(19.4, -99.1)
    expect(result).toEqual({})
  })

  it('returns {} when GOOGLE_PLACES_API_KEY is missing', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await geocodeReverse(19.4, -99.1)

    expect(result).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns {} for non-finite coordinates without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await geocodeReverse(Number.NaN, -99.1)).toEqual({})
    expect(await geocodeReverse(19.4, Number.POSITIVE_INFINITY)).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('handleGeocodeReverse', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects with 400 when lat/lng are missing or non-numeric', async () => {
    const out1 = await handleGeocodeReverse({})
    expect(out1.status).toBe(400)
    const out2 = await handleGeocodeReverse({ lat: 'foo', lng: 'bar' })
    expect(out2.status).toBe(400)
  })

  it('returns 200 + label on a valid request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SAMPLE_GEOCODE_RESPONSE)))
    const outcome = await handleGeocodeReverse({ lat: 19.4, lng: -99.1, hl: 'en' })
    expect(outcome.status).toBe(200)
    expect(outcome.body).toMatchObject({
      label: 'Mexico City, Ciudad de Mexico, Mexico',
      placeId: expect.any(String),
    })
  })
})
