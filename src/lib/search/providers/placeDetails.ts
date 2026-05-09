import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'place_details',
  description:
    'Look up a single place by its `place_id` (from a prior ' +
    '`search_places_google` or `search_places_nearby` result — usually a ' +
    '"ChIJ…" identifier, optionally prefixed "places/"). Returns address, ' +
    'phone, website, current opening hours, price level and rating via ' +
    'the Google Places API (New) Place Details endpoint. Call this when ' +
    'the user asks "open now?", "phone", "what\'s the address", "menu", ' +
    'or "more info" about a specific place from earlier results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      place_id: {
        type: Type.STRING,
        description:
          'The place_id returned by an earlier search. May be the bare ' +
          '"ChIJ…" id or the fully-qualified "places/ChIJ…" form.',
      },
      hl: { type: Type.STRING, description: 'UI language code, e.g. "en", "es".' },
    },
    required: ['place_id'],
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

export const placeDetailsProvider: SearchProvider = {
  name: 'place_details',
  kind: 'place',
  declaration,
  async handler(args) {
    const placeId = String((args.place_id as string | undefined) ?? '').trim()
    if (!placeId) {
      logEvent('search.place_details.empty', { reason: 'no place_id' })
      return []
    }
    logEvent('search.place_details.request', { placeId })
    const payload = await callProxy('place_details', {
      place_id: placeId,
      hl: typeof args.hl === 'string' ? args.hl : undefined,
    })
    return payload.results.map(adapt)
  },
}
