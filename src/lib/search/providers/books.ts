import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

const declaration: FunctionDeclaration = {
  name: 'search_books',
  description:
    'Search for books via the Google Books API. Use whenever the user is ' +
    'looking for a book, novel, essay, textbook, or a specific author. ' +
    'Returns title (with subtitle), author(s), description, publisher, ' +
    'year, page count, ISBN, categories, ratings, language, cover image ' +
    'and a link. Compose `query` like a Google Books query: free text ' +
    'works, but precise lookups use the operators ' +
    '`intitle:"Flowers for Algernon"`, `inauthor:"Daniel Keyes"`, ' +
    '`subject:dystopian`, `inpublisher:Harcourt`, or `isbn:9780156030083`. ' +
    'Combine operators with free text in a single query string.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          'Free text plus optional operators (intitle:, inauthor:, ' +
          'subject:, inpublisher:, isbn:). E.g. ' +
          '"inauthor:keyes flowers for algernon".',
      },
      max_results: { type: Type.NUMBER },
      hl: {
        type: Type.STRING,
        description:
          'ISO-639-1 language code (e.g. "en", "es") that biases results ' +
          'toward that language via the API\'s langRestrict parameter.',
      },
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
