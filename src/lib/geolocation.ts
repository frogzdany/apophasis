// Browser geolocation wrapper.
//
// Wraps `navigator.geolocation.getCurrentPosition` in a Promise and maps
// the four PositionError codes (plus the "no API at all" case) to a
// tagged union so the UI can render distinct copy per failure mode.
// High-accuracy is on; the 10 s timeout matches what most browsers' own
// permission prompts use before timing out internally.

export interface UserLocation {
  lat: number
  lng: number
  accuracy?: number
  // Optional human-readable label (e.g. "Mexico City, CDMX, Mexico").
  // Populated by a follow-up reverse-geocode call; absent until then.
  label?: string
}

export type GeolocationFailure =
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'timeout' }
  | { kind: 'unknown'; message: string }

export interface GeolocationOptions {
  timeoutMs?: number
  enableHighAccuracy?: boolean
}

const DEFAULT_TIMEOUT_MS = 10_000

export async function requestUserLocation(opts: GeolocationOptions = {}): Promise<UserLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw { kind: 'unsupported' } satisfies GeolocationFailure
  }
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const enableHighAccuracy = opts.enableHighAccuracy ?? true

  return new Promise<UserLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        reject(mapPositionError(err))
      },
      { timeout, enableHighAccuracy, maximumAge: 0 },
    )
  })
}

function mapPositionError(err: GeolocationPositionError): GeolocationFailure {
  switch (err.code) {
    case 1 /* PERMISSION_DENIED */:
      return { kind: 'denied' }
    case 2 /* POSITION_UNAVAILABLE */:
      return { kind: 'unavailable' }
    case 3 /* TIMEOUT */:
      return { kind: 'timeout' }
    default:
      return { kind: 'unknown', message: err.message || 'Unknown geolocation error' }
  }
}

export function isGeolocationFailure(value: unknown): value is GeolocationFailure {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return (
    kind === 'unsupported' ||
    kind === 'denied' ||
    kind === 'unavailable' ||
    kind === 'timeout' ||
    kind === 'unknown'
  )
}
