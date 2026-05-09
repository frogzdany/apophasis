// Reverse-geocode helper backing /api/geocode/reverse.
//
// Calls the Google Geocoding API with the same GOOGLE_PLACES_API_KEY the
// Places routes use (Geocoding shares the key — no new credential). We
// only return what the UI + Lucy need: a short city/region/country label
// and the place_id for the top match. Failures degrade silently to an
// empty payload; the caller decides whether to surface a UI error.
//
// Pre-flight: the Geocoding API ("geocoding-backend.googleapis.com") must
// be enabled on the GCP project the key belongs to. It is NOT in
// infra/main.tf's required_apis on purpose — the same key already works
// for Places, and adding the Geocoding API to terraform-managed services
// is left as a follow-up so this PR doesn't reach into infra.

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json'
const FETCH_TIMEOUT_MS = 6_000

interface GeocodeAddressComponent {
  long_name?: string
  short_name?: string
  types?: string[]
}

interface GeocodeResult {
  address_components?: GeocodeAddressComponent[]
  formatted_address?: string
  place_id?: string
}

interface GeocodeResponse {
  status?: string
  results?: GeocodeResult[]
  error_message?: string
}

export interface ReverseGeocodeResult {
  label?: string
  placeId?: string
  formatted?: string
}

function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('geocode timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

function pickComponent(
  components: GeocodeAddressComponent[],
  type: string,
): string | undefined {
  for (const c of components) {
    if (c.types?.includes(type)) {
      return c.long_name || c.short_name
    }
  }
  return undefined
}

export function buildLocationLabel(
  components: GeocodeAddressComponent[] = [],
): string | undefined {
  const locality =
    pickComponent(components, 'locality') ??
    pickComponent(components, 'postal_town') ??
    pickComponent(components, 'sublocality') ??
    pickComponent(components, 'administrative_area_level_2')
  const adminArea = pickComponent(components, 'administrative_area_level_1')
  const country = pickComponent(components, 'country')
  const parts = [locality, adminArea, country].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
  if (parts.length === 0) return undefined
  // De-dupe adjacent identical entries (some places have locality === admin
  // area, e.g. city-states, and we don't want "Singapore, Singapore").
  const deduped: string[] = []
  for (const p of parts) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== p.toLowerCase()) {
      deduped.push(p)
    }
  }
  return deduped.join(', ')
}

export async function geocodeReverse(
  lat: number,
  lng: number,
  languageCode?: string,
): Promise<ReverseGeocodeResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return {}
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {}

  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key })
  if (languageCode) params.set('language', languageCode)

  try {
    const res = await withTimeout(fetch(`${GEOCODE_BASE}?${params.toString()}`))
    if (!res.ok) return {}
    const body = (await res.json()) as GeocodeResponse
    if (body.status !== 'OK' || !body.results?.length) return {}
    const top = body.results[0]
    const label = buildLocationLabel(top.address_components)
    return {
      label,
      placeId: top.place_id,
      formatted: top.formatted_address,
    }
  } catch {
    return {}
  }
}

export interface GeocodeRequestBody {
  lat?: unknown
  lng?: unknown
  hl?: unknown
}

export interface GeocodeOutcome {
  status: number
  body: ReverseGeocodeResult | { error: string }
}

export async function handleGeocodeReverse(
  body: GeocodeRequestBody,
): Promise<GeocodeOutcome> {
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: 400, body: { error: 'lat and lng must be finite numbers' } }
  }
  const hl = typeof body.hl === 'string' ? body.hl : undefined
  const result = await geocodeReverse(lat, lng, hl)
  return { status: 200, body: result }
}
