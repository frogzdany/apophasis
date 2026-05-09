import { describe, expect, it } from 'vitest'
import { placesProvider } from '@/lib/search/providers/places'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import {
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

const TOOL = 'search_places'

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running'
  return skipMissing('SERPAPI_KEY')
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(placesProvider)
    expect(SEARCH_PROVIDERS).toContain(placesProvider)
    expect(placesProvider.declaration.name).toBe(TOOL)
    expect(placesProvider.kind).toBe('place')
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid results for a known city + cuisine', async () => {
    const results = await placesProvider.handler(
      { query: 'ramen', location: 'Mexico City' },
      5,
    )
    expect(results.length, 'expected ≥ 1 place hit').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('place')
    expectLucyReadyTitle(top)
    expectShortDescription(top)
  })

  it.skipIf(skip)('top result has an address that matches the location hint', async () => {
    const results = await placesProvider.handler(
      { query: 'ramen', location: 'Mexico City' },
      5,
    )
    const top = results[0]
    expect(top.subtitle, 'place result should expose an address as subtitle').toBeTruthy()
    const addr = (top.subtitle ?? '').toLowerCase()
    const matchesLocation =
      addr.includes('mexico') || addr.includes('méxico') || addr.includes('cdmx')
    expect(matchesLocation, `address "${top.subtitle}" should reference Mexico/CDMX`).toBe(true)
  })

  it.skipIf(skip)('top result carries a rating or review-count facet', async () => {
    const results = await placesProvider.handler(
      { query: 'ramen', location: 'Mexico City' },
      5,
    )
    const top = results[0]
    const facets = top.facets ?? {}
    expect(
      'rating' in facets || 'reviews' in facets,
      `expected rating/reviews facet on top result, got: ${JSON.stringify(facets)}`,
    ).toBe(true)
  })

  it.skipIf(skip)('returns [] for an empty query', async () => {
    const results = await placesProvider.handler({ query: '' }, 5)
    expect(results).toEqual([])
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await placesProvider.handler(
      { query: 'ramen', location: 'Mexico City', max_results: 2 },
      5,
    )
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
