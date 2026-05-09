import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_web',
  description:
    'Generic web search. Fans out across Brave (independent index), Tavily ' +
    '(LLM-curated with a synthesised answer) and Exa (semantic / neural) ' +
    'in parallel and returns deduped top results. Use as the fallback ' +
    'whenever the user is asking about a person, concept, news event, ' +
    'article, or anything that does not fit a specialised provider ' +
    '(songs → search_music, videos → search_video, books → search_books, ' +
    'places → search_places, products → search_products). Compose `query` ' +
    'like a natural-language Google query.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Free text query. Natural language works best.',
      },
      max_results: { type: Type.NUMBER },
    },
    required: ['query'],
  },
}

function adapt(r: ProxyResult): SearchResult {
  return {
    id: r.id,
    kind: 'web',
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageUrl: r.imageUrl,
    externalUrl: r.url,
    facets: r.facets ?? {},
    reason: r.reason,
  }
}

export const webProvider: SearchProvider = {
  name: 'search_web',
  kind: 'web',
  declaration,
  async handler(args, limit = 5) {
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('search.web.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    logEvent('search.web.request', { query, max })

    const payload = await callProxy('web', { query, max_results: max })
    const adapted: SearchResult[] = payload.results.map(adapt)

    // Tavily often returns a synthesised one-paragraph answer. Surface it as
    // a leading "summary" card so Lucy can read something coherent first.
    if (payload.answer) {
      adapted.unshift({
        id: 'tavily-answer',
        kind: 'web',
        title: 'Resumen / Summary',
        subtitle: 'Tavily',
        description: payload.answer,
        facets: {},
        reason: 'LLM-curated summary',
      })
    }

    return adapted.slice(0, max + (payload.answer ? 1 : 0))
  },
}
