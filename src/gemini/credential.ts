// Resolves the credential the browser will use to open a Gemini Live
// WebSocket.
//
// In production the backend mints a short-lived ephemeral token (see
// server/geminiToken.ts) so the long-lived API key never ships to the
// browser. The browser tells the endpoint which voice + language it wants
// so the token's liveConnectConstraints lock those into speechConfig —
// without that, Live API ignores the client's voiceConfig and uses a
// default voice.
//
// Locally — when there is no backend in front — fall back to
// VITE_GEMINI_API_KEY so `bun run dev:all` still works. The dev branch is
// guarded by `import.meta.env.DEV` so Vite's tree-shaker drops it (and
// stops baking the literal key value) from production builds.

const TOKEN_ENDPOINT = '/api/gemini-token'

interface MintedTokenResponse {
  token: string
  expiresAt: string
  model: string
}

export interface CredentialOptions {
  voice?: string
  language?: string
  // When the user has shared their browser geolocation (and optionally a
  // reverse-geocoded label), we forward it to the token mint so Lucy's
  // baked-in system instruction includes the proximity-routing block.
  userLocation?: { lat: number; lng: number; label?: string; accuracy?: number } | null
}

export async function getLiveCredential(opts: CredentialOptions = {}): Promise<string> {
  // Try the backend first. The dev Vite proxy forwards /api → :8787, and in
  // prod the same Cloud Run service serves both.
  let backendErr: unknown = null
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
    })
    if (res.ok) {
      const body = (await res.json()) as MintedTokenResponse
      if (body?.token) return body.token
      backendErr = new Error('token endpoint returned no token')
    } else {
      const text = await res.text().catch(() => '')
      backendErr = new Error(`token endpoint ${res.status}: ${text || res.statusText}`)
    }
  } catch (err) {
    backendErr = err
  }

  // Dev-only fallback. Wrapped in `if (import.meta.env.DEV)` so Vite drops
  // the entire branch (and any reference to VITE_GEMINI_API_KEY) from prod
  // bundles via dead-code elimination.
  if (import.meta.env.DEV) {
    const devKey = import.meta.env.VITE_GEMINI_API_KEY
    if (devKey) return devKey
  }

  throw backendErr instanceof Error
    ? backendErr
    : new Error(String(backendErr ?? 'no Gemini credential available'))
}
