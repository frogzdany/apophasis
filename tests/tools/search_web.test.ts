import { describe, expect, it } from 'vitest'
import { webProvider } from '@/lib/search/providers/web'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import {
  expectActionable,
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

// search_web fans out across Brave + Tavily + Exa via /api/search/web.
// Skip if NONE of the three keys are configured — with at least one we can
// still produce some results.

const TOOL = 'search_web'

function skipReason(): string | false {
  if (!process.env.LUCY_TEST_PROXY_URL) return 'proxy not running (globalSetup failed)'
  const allMissing =
    skipMissing('BRAVE_API_KEY') && skipMissing('TAVILY_API_KEY') && skipMissing('EXA_API_KEY')
  return allMissing
    ? 'no web upstream keys configured (BRAVE_API_KEY / TAVILY_API_KEY / EXA_API_KEY)'
    : false
}

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(webProvider)
    expect(SEARCH_PROVIDERS).toContain(webProvider)
    expect(webProvider.declaration.name).toBe(TOOL)
    expect(webProvider.kind).toBe('web')
  })

  const skip = skipReason()

  it.skipIf(skip)('returns schema-valid results for a person query', async () => {
    const results = await webProvider.handler({ query: 'who is Yann LeCun' }, 5)
    expect(results.length, 'expected ≥ 1 web result').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('web')
    expectLucyReadyTitle(top)
    expectShortDescription(top)
    // The first card may be Tavily's synthesised answer (no externalUrl);
    // assert that SOMEWHERE in the top 3 there is an actionable hit.
    const actionable = results.slice(0, 3).find((r) => r.externalUrl || r.preview || r.imageUrl)
    expect(actionable, 'top 3 should contain at least one actionable result').toBeTruthy()
    if (actionable) expectActionable(actionable)
  })

  it.skipIf(skip)('hit /api/search/web shows multi-provider provenance', async () => {
    const baseUrl = process.env.LUCY_TEST_PROXY_URL
    const res = await fetch(`${baseUrl}/api/search/web`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl as string },
      body: JSON.stringify({ query: 'who is Yann LeCun', max_results: 3 }),
    })
    expect(res.ok).toBe(true)
    const payload = (await res.json()) as {
      results: unknown[]
      answer?: string
      provenance?: Record<string, number>
    }
    expect(payload.provenance, 'provenance object should be present').toBeDefined()
    expect(payload.provenance && Object.keys(payload.provenance)).toEqual(
      expect.arrayContaining(['brave', 'tavily', 'exa']),
    )
    if (payload.answer) {
      expect(
        payload.answer.length,
        'tavily answer should be trimmed to ≤ 320 chars',
      ).toBeLessThanOrEqual(320)
    }
  })

  it.skipIf(skip)('returns [] for an empty query', async () => {
    const results = await webProvider.handler({ query: '' }, 5)
    expect(results).toEqual([])
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await webProvider.handler({ query: 'who is Yann LeCun', max_results: 2 }, 5)
    // +1 because the synthesised Tavily "answer" card is appended to the
    // top of the array; cap is on raw web results, not the synthetic one.
    expect(results.length).toBeLessThanOrEqual(3)
  })
})
