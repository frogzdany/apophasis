// Bun HTTP server for the Apophasis demo.
//
// Routes:
//   POST /api/log              — append a JSONL event to the session log store
//   GET  /api/health           — liveness + log-backend description
//   POST /api/gemini-token     — mint a short-lived Gemini Live ephemeral token
//   *                          — when DIST_DIR is set, serve static SPA assets
//                                with SPA fallback to index.html
//
// Run alongside Vite (dev):    bun run server
// Run as the prod artifact:    bun run server/index.ts (DIST_DIR=/app/dist)

import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { mintEphemeralToken } from './geminiToken'
import { appendLog, describeStore } from './logStore'
import { cacheStats } from './searchCache'
import { handleSearchRequest } from './searchProxy'
import { searchRateOk } from './searchRateLimit'

interface LogEntry {
  sessionId: string
  ts?: string
  kind: string
  // biome-ignore lint/suspicious/noExplicitAny: free-form payload by design
  payload?: any
}

const PORT = Number(process.env.PORT ?? 8787)
const DIST_DIR = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : null

// Comma-separated extra origins permitted to call /api/* (full origin form,
// e.g. "https://example.com"). Same-origin (matches the request Host) is
// always allowed. Empty by default → only same-origin works.
const EXTRA_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Sliding-window per-IP cap on /api/gemini-token. Per Cloud Run instance —
// effective cap = MAX_PER_WINDOW × active instance count. Good enough as a
// drive-by-abuse backstop; pair with the per-day quota on the Gemini API
// key (set in AI Studio) for a true hard cap.
const TOKEN_RATE_WINDOW_MS = 5 * 60_000
const TOKEN_RATE_MAX = 30
const tokenRate = new Map<string, { count: number; resetAt: number }>()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeadersFor(req) })
    }

    // ─── API ────────────────────────────────────────────────────────────
    if (url.pathname === '/api/health') {
      // Health stays open so Cloud Run probes and curl-from-shell work.
      return json(
        { ok: true, store: describeStore(), searchCache: cacheStats() },
        200,
        req,
      )
    }

    // Everything else under /api/* is gated by Origin allowlist.
    if (url.pathname.startsWith('/api/') && !originAllowed(req)) {
      return json({ error: 'forbidden origin' }, 403, req)
    }

    if (url.pathname === '/api/log' && req.method === 'POST') {
      try {
        const body = (await req.json()) as LogEntry
        if (!body?.sessionId || !body?.kind) {
          return json({ error: 'sessionId and kind required' }, 400, req)
        }
        await appendLog(body)
        return json({ ok: true }, 200, req)
      } catch (err) {
        console.error('[log] write failed', err)
        return json({ error: String(err) }, 500, req)
      }
    }

    if (url.pathname === '/api/gemini-token' && req.method === 'POST') {
      if (!tokenRateOk(clientIp(req))) {
        return json({ error: 'rate limit exceeded' }, 429, req)
      }
      try {
        // Body is optional; clients send { voice, language } so the minted
        // token's liveConnectConstraints lock to the right speechConfig.
        let body: { voice?: string; language?: string } = {}
        try {
          body = (await req.json()) as typeof body
        } catch {
          /* empty body is fine — falls back to defaults */
        }
        const minted = await mintEphemeralToken(body)
        return json(minted, 200, req)
      } catch (err) {
        console.error('[gemini-token] mint failed', err)
        return json({ error: String(err) }, 500, req)
      }
    }

    // /api/search/<provider> — proxy for Brave / Tavily / Exa / SerpApi.
    // Keys live server-side; browser providers POST { query, max_results, ... }.
    // Allow underscores so multi-word providers like `places_google`,
    // `places_nearby`, `place_details` route correctly.
    const searchMatch = url.pathname.match(/^\/api\/search\/([a-z_]+)$/)
    if (searchMatch && req.method === 'POST') {
      if (!searchRateOk(clientIp(req))) {
        return json({ error: 'rate limit exceeded' }, 429, req)
      }
      let body: Record<string, unknown> = {}
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'invalid JSON body' }, 400, req)
      }
      const provider = searchMatch[1]
      const outcome = await handleSearchRequest(provider as string, body)
      return json(outcome.body, outcome.status, req)
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404, req)
    }

    // ─── Static SPA (prod) ─────────────────────────────────────────────
    if (DIST_DIR && req.method === 'GET') {
      const served = await serveStatic(url.pathname)
      if (served) return served
    }

    return json({ error: 'not found' }, 404, req)
  },
})

console.log(`[lucy-server] listening on http://localhost:${server.port}`)
console.log('[lucy-server] log store:', describeStore())
if (DIST_DIR) console.log('[lucy-server] serving SPA from', DIST_DIR)

async function serveStatic(pathname: string): Promise<Response | null> {
  if (!DIST_DIR) return null
  const safe = normalize(pathname).replace(/^\/+/, '')
  const candidate = safe === '' ? 'index.html' : safe
  const full = resolve(DIST_DIR, candidate)
  if (!full.startsWith(DIST_DIR)) return null
  const file = await tryFile(full)
  if (file) return file
  // SPA fallback: serve index.html for non-asset paths.
  if (!extname(candidate)) {
    return tryFile(join(DIST_DIR, 'index.html'))
  }
  return null
}

async function tryFile(full: string): Promise<Response | null> {
  try {
    const s = await stat(full)
    if (!s.isFile()) return null
  } catch {
    return null
  }
  const ext = extname(full).toLowerCase()
  const type = MIME[ext] ?? 'application/octet-stream'
  // index.html → no-cache, hashed assets → long cache.
  const cacheControl = full.endsWith('index.html')
    ? 'no-cache'
    : 'public, max-age=31536000, immutable'
  return new Response(Bun.file(full), {
    headers: { 'content-type': type, 'cache-control': cacheControl },
  })
}

// Same-origin (Origin host == request Host) is always permitted; extra
// origins from ALLOWED_ORIGINS env are also permitted. Falls back to the
// Referer header when Origin is missing (some clients omit it on simple
// requests).
function originAllowed(req: Request): boolean {
  const candidate = candidateOrigin(req)
  if (!candidate) return false
  const host = req.headers.get('host') ?? ''
  try {
    if (new URL(candidate).host === host) return true
  } catch {
    return false
  }
  return EXTRA_ALLOWED_ORIGINS.includes(candidate)
}

function candidateOrigin(req: Request): string | null {
  const origin = req.headers.get('origin')
  if (origin) return origin
  const referer = req.headers.get('referer')
  if (!referer) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? 'unknown'
  return 'unknown'
}

function tokenRateOk(ip: string): boolean {
  const now = Date.now()
  const entry = tokenRate.get(ip)
  if (!entry || entry.resetAt < now) {
    tokenRate.set(ip, { count: 1, resetAt: now + TOKEN_RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= TOKEN_RATE_MAX) return false
  entry.count += 1
  return true
}

function corsHeadersFor(req: Request): HeadersInit {
  // Only echo the Origin back if it's permitted; otherwise no CORS header
  // (keeping the response opaque to disallowed origins).
  const candidate = candidateOrigin(req)
  const allow = candidate && originAllowed(req) ? candidate : null
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  }
  if (allow) headers['access-control-allow-origin'] = allow
  return headers
}

// biome-ignore lint/suspicious/noExplicitAny: response data is free-form
function json(data: any, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(req ? corsHeadersFor(req) : {}),
    },
  })
}
