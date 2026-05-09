import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_products',
  description:
    'Search for products via Google Shopping (proxied through SerpApi). ' +
    'Use whenever the user is trying to buy / shop / find a specific item ' +
    'with a price tag. Returns title, store, price, rating, link and image. ' +
    'Free-text query — natural language works ("waterproof hiking boots ' +
    'under 200" is fine).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Product keyword(s) or natural-language description.',
      },
      max_results: { type: Type.NUMBER },
      hl: { type: Type.STRING, description: 'UI language code, e.g. "en", "es".' },
      gl: { type: Type.STRING, description: 'Country code, e.g. "us", "mx".' },
    },
    required: ['query'],
  },
}

function adapt(r: ProxyResult): SearchResult {
  return {
    id: r.id,
    kind: 'product',
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageUrl: r.imageUrl,
    externalUrl: r.url,
    facets: r.facets ?? {},
    reason: r.reason,
  }
}

export const productsProvider: SearchProvider = {
  name: 'search_products',
  kind: 'product',
  declaration,
  async handler(args, limit = 5) {
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('search.products.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    logEvent('search.products.request', { query, max })

    const payload = await callProxy('products', {
      query,
      max_results: max,
      hl: typeof args.hl === 'string' ? args.hl : undefined,
      gl: typeof args.gl === 'string' ? args.gl : undefined,
    })
    return payload.results.map(adapt)
  },
}
