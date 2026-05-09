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
  return skipMissing('BRAVE_API_KEY')
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(productsProvider)
    expect(SEARCH_PROVIDERS).toContain(productsProvider)
    expect(productsProvider.declaration.name).toBe(TOOL)
    expect(productsProvider.kind).toBe('product')
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid image results for a generic product query', async () => {
    const results = await productsProvider.handler({ query: 'running shoes' }, 5)
    expect(results.length, 'expected ≥ 1 image hit').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('product')
    expectLucyReadyTitle(top)
    // expectActionable already checks externalUrl OR preview OR imageUrl
    // — for image search every result should carry an imageUrl, which is
    // what the morph consumes.
    expectActionable(top)
    expectShortDescription(top)
    expect(top.imageUrl, 'every product result should have an imageUrl for the morph').toBeTruthy()
  })

  it.skipIf(skip)('top result has page_url + image dimensions for the morph picker', async () => {
    const results = await productsProvider.handler({ query: 'running shoes' }, 5)
    const top = results[0]
    expect(top.externalUrl, 'should carry page_url so users can open the source').toBeTruthy()
    const facets = top.facets ?? {}
    // Brave returns dimensions on the vast majority of images. We assert
    // they're present on the TOP result so the morph picker can pre-filter
    // for square-ish frames.
    expect(typeof facets.width === 'number', 'top result should carry numeric width').toBe(true)
    expect(typeof facets.height === 'number', 'top result should carry numeric height').toBe(true)
  })

  it.skipIf(skip)('hl=es defaults to LATAM imagery', async () => {
    const results = await productsProvider.handler(
      { query: 'tenis para correr', hl: 'es' },
      5,
    )
    expect(results.length, 'expected ≥ 1 image hit for Spanish query').toBeGreaterThan(0)
    // Loose check: at least one of the top 3 sources resolves to a LATAM
    // domain (.mx is the most common; .com is also fine for global brands).
    const top3 = results.slice(0, 3)
    const localish = top3.some((r) => {
      const host = (r.facets?.host as string | undefined) ?? r.externalUrl ?? ''
      return host.includes('.mx') || host.includes('mercadolibre') || host.includes('liverpool')
    })
    expect(
      localish,
      `expected at least one LATAM-leaning host on hl=es; got hosts: ${JSON.stringify(
        top3.map((r) => r.facets?.host),
      )}`,
    ).toBe(true)
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
