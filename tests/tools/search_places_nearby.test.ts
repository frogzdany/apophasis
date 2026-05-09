import { describe, expect, it } from 'vitest'
import { placesNearbyProvider } from '@/lib/search/providers/placesNearby'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import { expectLucyReadyTitle, expectSchemaValidArray } from '../helpers/expects'

const TOOL = 'search_places_nearby'

// Roma Norte, Mexico City — same neighbourhood used by the SerpApi test
// fixtures, dense enough that any "restaurant" query within 800 m hits.
const ROMA_NORTE = { lat: 19.4151, lng: -99.1632 }

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running'
  return skipMissing('GOOGLE_PLACES_API_KEY')
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(placesNearbyProvider)
    expect(SEARCH_PROVIDERS).toContain(placesNearbyProvider)
    expect(placesNearbyProvider.declaration.name).toBe(TOOL)
    expect(placesNearbyProvider.kind).toBe('place')
  })

  it('returns [] when lat/lng are missing or non-finite (no upstream call)', async () => {
    expect(await placesNearbyProvider.handler({}, 5)).toEqual([])
    expect(await placesNearbyProvider.handler({ lat: 'foo', lng: 'bar' }, 5)).toEqual([])
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid restaurants near Roma Norte', async () => {
    const results = await placesNearbyProvider.handler(
      { ...ROMA_NORTE, radius_m: 800, included_types: ['restaurant'] },
      5,
    )
    expect(results.length, 'expected ≥ 1 nearby restaurant').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('place')
    expectLucyReadyTitle(top)
    expect(top.id.startsWith('gplace:')).toBe(true)
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await placesNearbyProvider.handler(
      { ...ROMA_NORTE, radius_m: 800, max_results: 2 },
      5,
    )
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it.skipIf(skip)('clamps radius_m above the 50 000 m hard cap', async () => {
    // Just exercises the path — we don't assert on Google's behaviour at
    // the upper bound, only that the request goes through and returns
    // something (clamp happens inside the proxy).
    const results = await placesNearbyProvider.handler(
      { ...ROMA_NORTE, radius_m: 9_999_999 },
      3,
    )
    expectSchemaValidArray(results, TOOL)
  })
})
