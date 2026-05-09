import { describe, expect, it } from 'vitest'
import { youtubeProvider } from '@/lib/search/providers/youtube'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import { skipMissing } from '../helpers/env'
import {
  expectActionable,
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

// YouTube Data API v3 — browser-direct, key ships via VITE_YOUTUBE_API_KEY.
// In Node, that env var is read via `import.meta.env`, so we copy it from
// process.env if needed.
const TOOL = 'search_video'
const YT_KEY = 'VITE_YOUTUBE_API_KEY'

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(youtubeProvider)
    expect(SEARCH_PROVIDERS).toContain(youtubeProvider)
    expect(youtubeProvider.declaration.name).toBe(TOOL)
    expect(youtubeProvider.kind).toBe('video')
  })

  const skip = skipMissing(YT_KEY)

  it.skipIf(skip)('returns schema-valid results for a known query', async () => {
    const results = await youtubeProvider.handler({ query: 'AlphaGo documentary trailer' }, 5)
    expect(results.length, 'expected ≥ 1 YouTube hit').toBeGreaterThan(0)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('video')
    expectLucyReadyTitle(top)
    expectActionable(top)
    expectShortDescription(top)
  })

  it.skipIf(skip)('top result links to a YouTube watch URL', async () => {
    const results = await youtubeProvider.handler({ query: 'AlphaGo documentary trailer' }, 3)
    const top = results[0]
    expect(top.externalUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/)
    expect(top.preview?.kind).toBe('iframe')
    expect(top.preview?.url).toMatch(/^https:\/\/www\.youtube\.com\/embed\//)
  })

  it.skipIf(skip)('returns [] for an empty query', async () => {
    const results = await youtubeProvider.handler({ query: '' }, 5)
    expect(results).toEqual([])
  })

  it.skipIf(skip)('respects max_results cap', async () => {
    const results = await youtubeProvider.handler({ query: 'AlphaGo', max_results: 2 }, 5)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
