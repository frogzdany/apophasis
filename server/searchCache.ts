// Tiny in-memory LRU with TTL for search proxy responses. Single instance,
// resets on cold start — fine for the demo. Not for sensitive payloads.

const TTL_MS = 10 * 60_000
const MAX_ENTRIES = 500

interface Entry {
  value: unknown
  expiresAt: number
}

const store = new Map<string, Entry>()

export function normaliseQuery(args: Record<string, unknown>): string {
  // Sort keys, lowercase strings, collapse whitespace so logically-equal
  // queries collide on the same cache slot.
  const keys = Object.keys(args).sort()
  const out: string[] = []
  for (const k of keys) {
    const v = args[k]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      out.push(`${k}=${v.map((x) => String(x).toLowerCase().trim()).sort().join(',')}`)
    } else {
      out.push(`${k}=${String(v).toLowerCase().replace(/\s+/g, ' ').trim()}`)
    }
  }
  return out.join('&')
}

export function cacheKey(provider: string, args: Record<string, unknown>): string {
  return `${provider}:${normaliseQuery(args)}`
}

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    store.delete(key)
    return null
  }
  // LRU touch — re-insert moves it to most-recent.
  store.delete(key)
  store.set(key, hit)
  return hit.value as T
}

export function cacheSet(key: string, value: unknown): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest insertion (first key in iteration order).
    const oldest = store.keys().next().value
    if (oldest) store.delete(oldest)
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_MS })
}

export function cacheStats(): { size: number; max: number; ttlMs: number } {
  return { size: store.size, max: MAX_ENTRIES, ttlMs: TTL_MS }
}
