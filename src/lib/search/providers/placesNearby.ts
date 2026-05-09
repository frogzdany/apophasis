import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_places_nearby',
  description:
    'Find places within a radius of an explicit lat/lng using the Google ' +
    'Places API (New) Nearby Search. Use ONLY when you have coordinates ' +
    "(from a prior tool result, or because the user gave them) — " +
    'otherwise prefer `search_places_google` with a free-text `location`. ' +
    'Default radius is 1500 m (max 50000). Optional `included_types` ' +
    'filters by primary place type, e.g. ["restaurant"], ["cafe","bakery"].',
  parameters: {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER, description: 'Latitude in decimal degrees.' },
      lng: { type: Type.NUMBER, description: 'Longitude in decimal degrees.' },
      radius_m: {
        type: Type.NUMBER,
        description: 'Radius in metres around (lat, lng). Default 1500, max 50000.',
      },
      included_types: {
        type: Type.ARRAY,
        description:
          'Optional list of Google "Place types (New)" Table A primary ' +
          'types to filter results, e.g. ["restaurant"].',
        items: { type: Type.STRING },
      },
      max_results: { type: Type.NUMBER },
      hl: { type: Type.STRING, description: 'UI language code, e.g. "en", "es".' },
    },
    required: ['lat', 'lng'],
  },
}

function adapt(r: ProxyResult): SearchResult {
  return {
    id: r.id,
    kind: 'place',
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageUrl: r.imageUrl,
    externalUrl: r.url,
    facets: r.facets ?? {},
    reason: r.reason,
  }
}

export const placesNearbyProvider: SearchProvider = {
  name: 'search_places_nearby',
  kind: 'place',
  declaration,
  async handler(args, limit = 5) {
    const lat = Number(args.lat)
    const lng = Number(args.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      logEvent('search.places_nearby.empty', { reason: 'no coordinates' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    const radius = Math.max(1, Math.min(Number(args.radius_m) || 1500, 50_000))
    const includedTypes = Array.isArray(args.included_types)
      ? (args.included_types as unknown[]).filter(
          (t): t is string => typeof t === 'string' && t.length > 0,
        )
      : undefined
    logEvent('search.places_nearby.request', { lat, lng, radius, max, includedTypes })

    const payload = await callProxy('places_nearby', {
      max_results: max,
      lat,
      lng,
      radius_m: radius,
      included_types: includedTypes,
      hl: typeof args.hl === 'string' ? args.hl : undefined,
    })
    return payload.results.map(adapt)
  },
}
