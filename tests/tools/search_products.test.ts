import { describe, expect, it } from 'vitest'
import { productsProvider } from '@/lib/search/providers/products'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import {
  expectActionable,
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

const TOOL = 'search_products'

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running'
  return skipMissing('SERPAPI_KEY')
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(productsProvider)
    expect(SEARCH_PROVIDERS).toContain(productsProvider)
    expect(productsProvider.declaration.name).toBe(TOOL)
    expect(productsProvider.kind).toBe('product')
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid results for a generic shopping query', async () => {
    const results = await productsProvider.handler({ query: 'running shoes' }, 5)
    expect(results.length, 'expected ≥ 1 product hit').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('product')
    expectLucyReadyTitle(top)
    expectActionable(top)
    expectShortDescription(top)
  })

  it.skipIf(skip)('top result has both a price facet and a store subtitle', async () => {
    const results = await productsProvider.handler({ query: 'running shoes' }, 5)
    const top = results[0]
    const facets = top.facets ?? {}
    expect(facets.price, 'product result should carry a price facet').toBeTruthy()
    // SerpApi sometimes omits the source — fall back to facets.store.
    const store = top.subtitle ?? (facets.store as string | undefined)
    expect(store, 'product result should carry a store name (subtitle/facets.store)').toBeTruthy()
  })

  it.skipIf(skip)('returns [] for an empty query', async () => {
    const results = await productsProvider.handler({ query: '' }, 5)
    expect(results).toEqual([])
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await productsProvider.handler({ query: 'running shoes', max_results: 2 }, 5)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
