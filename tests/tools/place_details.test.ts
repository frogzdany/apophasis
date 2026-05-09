import { describe, expect, it } from 'vitest'
import { placeDetailsProvider } from '@/lib/search/providers/placeDetails'
import { placesGoogleProvider } from '@/lib/search/providers/placesGoogle'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import { expectLucyReadyTitle, expectSchemaValidArray } from '../helpers/expects'

const TOOL = 'place_details'

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running'
  return skipMissing('GOOGLE_PLACES_API_KEY')
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(placeDetailsProvider)
    expect(SEARCH_PROVIDERS).toContain(placeDetailsProvider)
    expect(placeDetailsProvider.declaration.name).toBe(TOOL)
    expect(placeDetailsProvider.kind).toBe('place')
  })

  it('returns [] for an empty place_id (no upstream call)', async () => {
    expect(await placeDetailsProvider.handler({ place_id: '' })).toEqual([])
    expect(await placeDetailsProvider.handler({})).toEqual([])
  })

  const skip = skipReason()

  it.skipIf(skip)(
    'resolves a place_id from search_places_google into a single details record',
    async () => {
      const seeds = await placesGoogleProvider.handler(
        { query: 'Pujol', location: 'Mexico City' },
        3,
      )
      expect(seeds.length, 'seed search returned no places').toBeGreaterThan(0)
      // Strip the "gplace:" prefix the adapter adds — the upstream id is
      // what place_details expects.
      const seedId = seeds[0].id.replace(/^gplace:/, '')

      const results = await placeDetailsProvider.handler({ place_id: seedId })
      expect(results.length).toBe(1)
      expectSchemaValidArray(results, TOOL)
      const detail = results[0]
      expect(detail.kind).toBe('place')
      expectLucyReadyTitle(detail)

      const facets = detail.facets ?? {}
      const hasDetailFacet = 'phone' in facets || 'hours' in facets
      expect(
        hasDetailFacet,
        `expected phone or hours facet on details record, got: ${JSON.stringify(facets)}`,
      ).toBe(true)
    },
  )

  it.skipIf(skip)('accepts the "places/<id>" prefixed form', async () => {
    const seeds = await placesGoogleProvider.handler(
      { query: 'Pujol', location: 'Mexico City' },
      3,
    )
    const seedId = seeds[0].id.replace(/^gplace:/, '')
    const results = await placeDetailsProvider.handler({ place_id: `places/${seedId}` })
    expect(results.length).toBe(1)
  })
})
