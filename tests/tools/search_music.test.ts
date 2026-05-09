import { describe, expect, it } from 'vitest'
import { musicProvider } from '@/lib/search/providers/music'
import { PROVIDERS_BY_NAME, SEARCH_PROVIDERS } from '@/lib/search/registry'
import {
  expectActionable,
  expectLucyReadyTitle,
  expectSchemaValidArray,
  expectShortDescription,
} from '../helpers/expects'

// iTunes Search is unauthenticated and CORS-open, so this provider never
// touches the proxy. Skips are unlikely to fire — there's nothing to skip
// on. The "tool-specific extra" we assert here: at least one of the top
// results carries an audio preview, which is what makes Lucy's "play it"
// gesture work.

const TOOL = 'search_music'

describe(TOOL, () => {
  it('is registered with the right name', () => {
    expect(PROVIDERS_BY_NAME[TOOL]).toBe(musicProvider)
    expect(SEARCH_PROVIDERS).toContain(musicProvider)
    expect(musicProvider.declaration.name).toBe(TOOL)
    expect(musicProvider.kind).toBe('music')
  })

  it('handler accepts the args Lucy actually emits', async () => {
    const args = { fragment: 'careless whisper' }
    const results = await musicProvider.handler(args, 5)
    expect(Array.isArray(results)).toBe(true)
    expect(results.length, 'expected ≥ 1 iTunes match').toBeGreaterThan(0)
  })

  it('returns schema-valid, Lucy-ready results', async () => {
    const results = await musicProvider.handler({ fragment: 'careless whisper' }, 5)
    expectSchemaValidArray(results, TOOL)
    const top = results[0]
    expect(top.kind).toBe('music')
    expectLucyReadyTitle(top)
    expectActionable(top)
    expectShortDescription(top)
    expect(top.subtitle, 'music result should have an artist subtitle').toBeTruthy()
  })

  it('top three include a playable preview', async () => {
    const results = await musicProvider.handler({ fragment: 'careless whisper' }, 5)
    const playable = results.slice(0, 3).filter((r) => r.preview?.kind === 'audio')
    expect(playable.length, 'at least one of the top 3 should have an audio preview').toBeGreaterThan(0)
  })

  it('returns [] (not throw) for an empty fragment', async () => {
    const results = await musicProvider.handler({ fragment: '' }, 5)
    expect(results).toEqual([])
  })

  it('respects max_results cap', async () => {
    const results = await musicProvider.handler({ fragment: 'careless whisper' }, 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
