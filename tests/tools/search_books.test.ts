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
  return skipMissing('SERPAPI_KEY')
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
    const results = await booksProvider.handler({ query: 'Ficciones Borges', hl: 'es' }, 5)
    expect(results.length, 'expected ≥ 1 book hit for Borges').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('book')
    expectLucyReadyTitle(top)
    expectActionable(top)
    expectShortDescription(top)
  })

  it.skipIf(skip)('top result has either a description or a subtitle Lucy can speak', async () => {
    const results = await booksProvider.handler({ query: 'Ficciones Borges', hl: 'es' }, 5)
    const top = results[0]
    const speakable = (top.description ?? '').length > 0 || (top.subtitle ?? '').length > 0
    expect(
      speakable,
      'book result should have description OR subtitle so Lucy has something to read',
    ).toBe(true)
  })

  it.skipIf(skip)('hl=es biases the result set toward Spanish sources', async () => {
    const results = await booksProvider.handler({ query: 'Ficciones Borges', hl: 'es' }, 5)
    // Loose check: at least one of the top 3 references a .es domain or a
    // Spanish-language Wikipedia / source. Avoids hard-coding a single URL.
    const top3 = results.slice(0, 3)
    const spanishish = top3.some((r) =>
      (r.externalUrl ?? r.subtitle ?? r.description ?? '').toLowerCase().includes('es.wikipedia') ||
      (r.externalUrl ?? '').includes('.es/') ||
      (r.subtitle ?? '').toLowerCase().includes('es ›'),
    )
    expect(spanishish, 'expected at least one Spanish-leaning source in top 3').toBe(true)
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
