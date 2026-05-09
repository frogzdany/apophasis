// Lightweight client logger that ships every interaction event to the Bun
// server (see server/index.ts) where it is appended to a per-session JSONL
// file under logs/. If the server isn't running, calls fail silently — the
// app keeps working.

let sessionId: string | null = null

function newSessionId(): string {
  // ISO timestamp + short random suffix so concurrent sessions don't collide.
  const iso = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const tag = Math.random().toString(36).slice(2, 6)
  return `lucy-${iso}-${tag}`
}

export function startLogSession(): string {
  sessionId = newSessionId()
  console.log('[lucy] log session', sessionId)
  return sessionId
}

export function endLogSession(): void {
  sessionId = null
}

export function getSessionId(): string | null {
  return sessionId
}

// biome-ignore lint/suspicious/noExplicitAny: payload is intentionally loose
export function logEvent(kind: string, payload?: any): void {
  if (!sessionId) return
  fetch('/api/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      kind,
      ts: new Date().toISOString(),
      payload,
    }),
  }).catch(() => {
    // Server probably not running. Don't spam console.
  })
}
