// Sliding-window per-IP rate limit for /api/search/*. Separate from the
// token-mint counter so a busy demo doesn't starve out token refreshes.

const WINDOW_MS = 5 * 60_000
const MAX_PER_WINDOW = 60

const counters = new Map<string, { count: number; resetAt: number }>()

export function searchRateOk(ip: string): boolean {
  const now = Date.now()
  const entry = counters.get(ip)
  if (!entry || entry.resetAt < now) {
    counters.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_PER_WINDOW) return false
  entry.count += 1
  return true
}
