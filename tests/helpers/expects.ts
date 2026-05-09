// Shared assertions used across the per-tool tests so that the same
// "Lucy-ready" definition lives in one place.

import { expect } from 'vitest'
import type { SearchResultZ } from '@/lib/search/schemas'
import { SearchResultSchema } from '@/lib/search/schemas'

const HTML_TAG = /<[^>]+>/

export function expectLucyReadyTitle(r: SearchResultZ): void {
  expect(r.title.length, 'title is non-empty').toBeGreaterThan(0)
  expect(HTML_TAG.test(r.title), `title has raw HTML: ${r.title}`).toBe(false)
}

// "Actionable" = Lucy can do something with the result besides speak it
// (open the link, play the preview, show the image). Without one of these
// the result is just a sentence — fine for a summary card, not enough for
// the gallery to be useful.
export function expectActionable(r: SearchResultZ): void {
  const has = Boolean(r.externalUrl) || Boolean(r.preview) || Boolean(r.imageUrl)
  expect(has, `expected externalUrl OR preview OR imageUrl on top result: ${JSON.stringify(r)}`).toBe(true)
}

export function expectSchemaValidArray(arr: unknown[], label = 'results'): void {
  for (let i = 0; i < arr.length; i++) {
    const parsed = SearchResultSchema.safeParse(arr[i])
    if (!parsed.success) {
      throw new Error(
        `${label}[${i}] failed SearchResultSchema:\n${parsed.error.toString()}\n` +
          `payload: ${JSON.stringify(arr[i], null, 2)}`,
      )
    }
  }
}

export function expectShortDescription(r: SearchResultZ, max = 500): void {
  if (r.description) {
    expect(
      r.description.length,
      `description should be ≤ ${max} chars; was ${r.description.length}`,
    ).toBeLessThanOrEqual(max)
  }
}
