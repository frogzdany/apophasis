import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_books',
  description:
    'Search for books via Google Books (proxied through SerpApi). Use ' +
    'whenever the user is looking for a book, novel, essay, textbook, or a ' +
    'specific author. Returns title, author(s), description, source, cover ' +
    'image and a link. Compose `query` like a Google Books query — a title ' +
    'snippet, an author name, an ISBN, or a topic all work.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Free text (title, author, ISBN, theme).',
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
    kind: 'book',
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageUrl: r.imageUrl,
    externalUrl: r.url,
    facets: r.facets ?? {},
    reason: r.reason,
  }
}

export const booksProvider: SearchProvider = {
  name: 'search_books',
  kind: 'book',
  declaration,
  async handler(args, limit = 5) {
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('search.books.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    logEvent('search.books.request', { query, max })

    const payload = await callProxy('books', {
      query,
      max_results: max,
      hl: typeof args.hl === 'string' ? args.hl : undefined,
    })
    return payload.results.map(adapt)
  },
}
