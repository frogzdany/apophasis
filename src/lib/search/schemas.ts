// Canonical runtime shapes for the search layer. Browser providers and
// tests both import these so a contract change has exactly one source of
// truth. Strict on fields Lucy depends on (id / kind / title), permissive
// on optional metadata. .strict() at the top level catches drift — adding
// a new field to the proxy response without updating the schema fails
// every test, forcing intentional updates.

import { z } from 'zod'

export const SEARCH_KINDS = [
  'music',
  'video',
  'book',
  'movie',
  'web',
  'place',
  'product',
  'other',
] as const

export const PROXY_KINDS = ['web', 'book', 'place', 'product'] as const

export const SearchPreviewSchema = z
  .object({
    kind: z.enum(['audio', 'video', 'iframe']),
    url: z.string().url(),
  })
  .strict()

export const SearchResultSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(SEARCH_KINDS),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().max(2000).optional(),
    imageUrl: z.string().url().optional(),
    externalUrl: z.string().url().optional(),
    preview: SearchPreviewSchema.optional(),
    facets: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    reason: z.string().optional(),
  })
  .strict()

export const NormalisedResultSchema = z
  .object({
    source: z.string().min(1),
    id: z.string().min(1),
    kind: z.enum(PROXY_KINDS),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().max(2000).optional(),
    url: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
    facets: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    reason: z.string().optional(),
    score: z.number().optional(),
  })
  .strict()

export const SearchProxyResponseSchema = z
  .object({
    results: z.array(NormalisedResultSchema),
    answer: z.string().max(500).optional(),
    elapsedMs: z.number().int().nonnegative().optional(),
    provenance: z.record(z.string(), z.number()).optional(),
    cached: z.boolean().optional(),
    error: z.string().optional(),
  })
  .strict()

export type SearchKindZ = z.infer<typeof SearchResultSchema>['kind']
export type SearchResultZ = z.infer<typeof SearchResultSchema>
export type NormalisedResultZ = z.infer<typeof NormalisedResultSchema>
export type SearchProxyResponseZ = z.infer<typeof SearchProxyResponseSchema>
