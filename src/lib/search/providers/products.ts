import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_products',
  description:
    'Search for product images via Brave Image Search. Use whenever the ' +
    'user is exploring or shopping for a specific item visually — the ' +
    'gallery feeds the morph animation, so what matters is clean photos, ' +
    'not prices. Returns image, source page link, host, and dimensions; ' +
    'price / store / rating are NOT available — never promise those. Free-' +
    'text query works ("waterproof hiking boots", "rolex submariner", ' +
    '"art-deco floor lamp").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Product keyword(s) or natural-language description.',
      },
      max_results: { type: Type.NUMBER },
      hl: {
        type: Type.STRING,
        description:
          'Search language code, e.g. "en", "es". Defaults to "es" when ' +
          'Lucy is speaking Spanish so LATAM-leaning images surface.',
      },
      gl: {
        type: Type.STRING,
        description:
          'Country code, e.g. "us", "mx". When omitted, defaults to MX ' +
          'for hl=es and US otherwise.',
      },
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
