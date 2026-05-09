import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isGeolocationFailure,
  requestUserLocation,
} from '@/lib/geolocation'

interface MockGeolocation {
  getCurrentPosition: (
    success: PositionCallback,
    error?: PositionErrorCallback,
    options?: PositionOptions,
  ) => void
}

function stubGeolocation(impl: MockGeolocation): void {
  vi.stubGlobal('navigator', { geolocation: impl })
}

function stubNoGeolocation(): void {
  vi.stubGlobal('navigator', {})
}

function fakeError(code: 1 | 2 | 3, message = ''): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

describe('requestUserLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with lat/lng/accuracy on success', async () => {
    stubGeolocation({
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 19.4326,
            longitude: -99.1332,
            accuracy: 35,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition)
      },
    })

    const loc = await requestUserLocation()
    expect(loc).toEqual({ lat: 19.4326, lng: -99.1332, accuracy: 35 })
  })

  it('rejects with kind=denied on PERMISSION_DENIED', async () => {
    stubGeolocation({
      getCurrentPosition: (_success, error) => {
        error?.(fakeError(1, 'denied'))
      },
    })
    await expect(requestUserLocation()).rejects.toMatchObject({ kind: 'denied' })
  })

  it('rejects with kind=unavailable on POSITION_UNAVAILABLE', async () => {
    stubGeolocation({
      getCurrentPosition: (_success, error) => {
        error?.(fakeError(2))
      },
    })
    await expect(requestUserLocation()).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('rejects with kind=timeout on TIMEOUT', async () => {
    stubGeolocation({
      getCurrentPosition: (_success, error) => {
        error?.(fakeError(3))
      },
    })
    await expect(requestUserLocation()).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('rejects with kind=unsupported when navigator.geolocation is missing', async () => {
    stubNoGeolocation()
    await expect(requestUserLocation()).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('honours a custom timeout via PositionOptions', async () => {
    let receivedTimeout: number | undefined
    stubGeolocation({
      getCurrentPosition: (_success, _error, options) => {
        receivedTimeout = options?.timeout
      },
    })
    void requestUserLocation({ timeoutMs: 1234 })
    expect(receivedTimeout).toBe(1234)
  })
})

describe('isGeolocationFailure', () => {
  it('matches each failure kind', () => {
    expect(isGeolocationFailure({ kind: 'denied' })).toBe(true)
    expect(isGeolocationFailure({ kind: 'unavailable' })).toBe(true)
    expect(isGeolocationFailure({ kind: 'timeout' })).toBe(true)
    expect(isGeolocationFailure({ kind: 'unsupported' })).toBe(true)
    expect(isGeolocationFailure({ kind: 'unknown', message: 'oops' })).toBe(true)
  })

  it('rejects unrelated shapes', () => {
    expect(isGeolocationFailure(null)).toBe(false)
    expect(isGeolocationFailure({})).toBe(false)
    expect(isGeolocationFailure({ kind: 'something-else' })).toBe(false)
    expect(isGeolocationFailure('denied')).toBe(false)
  })
})
