import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_places',
  description:
    'Search for physical places, businesses, restaurants, landmarks via ' +
    'Google Maps (proxied through SerpApi). Use whenever the user asks ' +
    'about a location, neighbourhood, "where can I…", "best X in Y", or a ' +
    'business by name. Returns name, address, rating, hours, type, link ' +
    'and an optional thumbnail. Pass `location` (free-text city/area) when ' +
    'the user gave one — it sharpens results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'What the user is looking for ("ramen", "tattoo studio").',
      },
      location: {
        type: Type.STRING,
        description:
          'Optional free-text location ("Mexico City", "Brooklyn, NY"). ' +
          'Combine with query if the user mentioned a place.',
      },
      max_results: { type: Type.NUMBER },
      hl: { type: Type.STRING, description: 'UI language code, e.g. "en", "es".' },
    },
    required: ['query'],
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

export const placesProvider: SearchProvider = {
  name: 'search_places',
  kind: 'place',
  declaration,
  async handler(args, limit = 5) {
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('search.places.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    logEvent('search.places.request', { query, max })

    const payload = await callProxy('places', {
      query,
      max_results: max,
      location: typeof args.location === 'string' ? args.location : undefined,
      hl: typeof args.hl === 'string' ? args.hl : undefined,
    })
    return payload.results.map(adapt)
  },
}
