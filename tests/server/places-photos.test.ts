import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adaptGooglePlace, resolvePlacePhoto } from '../../server/searchProxy'

describe('adaptGooglePlace', () => {
  it('threads the resolved photo URI into imageUrl', () => {
    const result = adaptGooglePlace(
      {
        id: 'abc',
        displayName: { text: 'Plaza de los Leones' },
        formattedAddress: 'Mexico City, Mexico',
        rating: 4.6,
        userRatingCount: 421,
        types: ['tourist_attraction'],
        photos: [{ name: 'places/abc/photos/xyz' }],
      },
      0,
      'https://lh3.googleusercontent.com/place-photo/xyz',
    )

    expect(result.imageUrl).toBe('https://lh3.googleusercontent.com/place-photo/xyz')
    expect(result.id).toBe('gplace:abc')
    expect(result.title).toBe('Plaza de los Leones')
    expect(result.subtitle).toBe('Mexico City, Mexico')
    expect(result.facets?.rating).toBe('★ 4.6')
    expect(result.facets?.reviews).toBe('421 reviews')
  })

  it('leaves imageUrl undefined when no photo URI is provided', () => {
    const result = adaptGooglePlace(
      { id: 'abc', displayName: { text: 'Untitled' } },
      0,
    )
    expect(result.imageUrl).toBeUndefined()
    expect(result.id).toBe('gplace:abc')
  })

  it('falls back to the index when the place lacks an id', () => {
    const result = adaptGooglePlace({ displayName: { text: 'No-ID Place' } }, 3, undefined)
    expect(result.id).toBe('gplace:3')
  })
})

describe('resolvePlacePhoto', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns the photoUri from the media endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'places/abc/photos/xyz/media',
          photoUri: 'https://lh3.googleusercontent.com/place-photo/xyz',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const uri = await resolvePlacePhoto('places/abc/photos/xyz')

    expect(uri).toBe('https://lh3.googleusercontent.com/place-photo/xyz')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('/v1/places/abc/photos/xyz/media')
    expect(String(calledUrl)).toContain('skipHttpRedirect=true')
    expect(String(calledUrl)).toContain('maxHeightPx=512')
    expect(String(calledUrl)).toContain('maxWidthPx=512')
    expect(init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key' })
  })

  it('returns undefined when the media endpoint returns a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not found', { status: 404 })),
    )
    const uri = await resolvePlacePhoto('places/missing/photos/x')
    expect(uri).toBeUndefined()
  })

  it('returns undefined when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network blip')))
    const uri = await resolvePlacePhoto('places/abc/photos/xyz')
    expect(uri).toBeUndefined()
  })

  it('returns undefined and skips the call when the API key is missing', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const uri = await resolvePlacePhoto('places/abc/photos/xyz')

    expect(uri).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
