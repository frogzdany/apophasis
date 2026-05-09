import { describe, expect, it } from 'vitest'
import { booksProvider } from '@/lib/search/providers/books'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import {
  expectActionable,
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

const TOOL = 'search_books'

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running'
  // The proxy uses Google Books primarily and SerpApi as fallback. Run
  // when either key is configured; skip only when both are missing.
  if (process.env.GOOGLE_BOOKS_API_KEY) return false
  if (process.env.SERPAPI_KEY) return false
  return 'missing env: GOOGLE_BOOKS_API_KEY or SERPAPI_KEY'
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(booksProvider)
    expect(SEARCH_PROVIDERS).toContain(booksProvider)
    expect(booksProvider.declaration.name).toBe(TOOL)
    expect(booksProvider.kind).toBe('book')
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid results for a known book', async () => {
    // The `inauthor:` operator narrows hard to one author so the top hit is
    // deterministic enough to assert facets on it.
    const results = await booksProvider.handler(
      { query: 'flowers inauthor:keyes', hl: 'en' },
      5,
    )
    expect(results.length, 'expected ≥ 1 book hit for Keyes').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('book')
    expectLucyReadyTitle(top)
    expectActionable(top)
    expectShortDescription(top)
    // Google Books returns industry identifiers for any reasonably popular
    // title. Lucy uses these to disambiguate editions and to drive ISBN
    // lookups, so we assert at least one is present on the top result.
    const hasIsbn =
      typeof top.facets?.isbn13 === 'string' || typeof top.facets?.isbn10 === 'string'
    expect(hasIsbn, `expected an ISBN facet on top result: ${JSON.stringify(top.facets)}`).toBe(true)
  })

  it.skipIf(skip)('top result has either a description or a subtitle Lucy can speak', async () => {
    const results = await booksProvider.handler(
      { query: 'flowers inauthor:keyes', hl: 'en' },
      5,
    )
    const top = results[0]
    const speakable = (top.description ?? '').length > 0 || (top.subtitle ?? '').length > 0
    expect(
      speakable,
      'book result should have description OR subtitle so Lucy has something to read',
    ).toBe(true)
  })

  it.skipIf(skip)('hl=es biases the result set toward Spanish-language books', async () => {
    const results = await booksProvider.handler({ query: 'Ficciones Borges', hl: 'es' }, 5)
    expect(results.length, 'expected ≥ 1 hit for Borges').toBeGreaterThan(0)
    // langRestrict=es is a hard filter on the Books API side, so every
    // returned volume should carry language='es'. Allow a single stray in
    // case the API returns an outlier with missing metadata.
    const spanishCount = results.filter((r) => r.facets?.language === 'es').length
    expect(
      spanishCount,
      `expected most results to be language='es', got facets: ${JSON.stringify(
        results.map((r) => r.facets?.language),
      )}`,
    ).toBeGreaterThanOrEqual(Math.max(1, results.length - 1))
  })

  it.skipIf(skip)('returns [] for an empty query', async () => {
    const results = await booksProvider.handler({ query: '' }, 5)
    expect(results).toEqual([])
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await booksProvider.handler({ query: 'Borges', max_results: 2 }, 5)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
