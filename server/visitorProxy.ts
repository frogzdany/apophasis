// Visitor-registration handler for /api/visitor.
//
// The browser dialog (src/ui/VisitorDialog.tsx) collects name + email
// (required) and LinkedIn URL (optional), runs reCAPTCHA v3 with
// action="visitor_register", and POSTs everything here. We verify the
// token against Google's siteverify (matching action + score threshold)
// and append a JSONL line to the existing logs bucket under
// `visitors/YYYY-MM-DD.jsonl` so the demo organiser can pull a daily
// CSV later via `gcloud storage cp`.
//
// Failure modes are deliberately user-friendly: every shape error
// returns 400 with a key the client can localise; reCAPTCHA failures
// return 403 with `error: 'recaptcha_failed'`. The route is rate-
// limited via the same per-IP search bucket the proxy uses.

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const EXPECTED_ACTION = 'visitor_register'
const SCORE_THRESHOLD = 0.5
const MAX_NAME = 120
const MAX_EMAIL = 200
const MAX_LINKEDIN = 200
// RFC-ish — good enough to reject obvious typos, generous enough not
// to fight unicode local-parts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINKEDIN_HOST_RE = /(^|\.)linkedin\.com$/i

const VISITOR_BUCKET = process.env.LOGS_BUCKET ?? ''
const VISITOR_PREFIX = 'visitors'

interface SiteverifyResponse {
  success?: boolean
  score?: number
  action?: string
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

export interface VisitorRequestBody {
  name?: unknown
  email?: unknown
  linkedin?: unknown
  recaptchaToken?: unknown
}

export interface VisitorOutcome {
  status: number
  body: { ok: true } | { ok: false; error: string; detail?: string }
}

interface NormalisedVisitor {
  name: string
  email: string
  linkedin?: string
}

function normaliseVisitor(input: VisitorRequestBody): NormalisedVisitor | { error: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  if (!name) return { error: 'name_required' }
  if (name.length > MAX_NAME) return { error: 'name_too_long' }
  if (!email) return { error: 'email_required' }
  if (email.length > MAX_EMAIL) return { error: 'email_too_long' }
  if (!EMAIL_RE.test(email)) return { error: 'email_invalid' }

  let linkedin: string | undefined
  if (typeof input.linkedin === 'string' && input.linkedin.trim().length > 0) {
    const raw = input.linkedin.trim()
    if (raw.length > MAX_LINKEDIN) return { error: 'linkedin_too_long' }
    let parsed: URL
    try {
      parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    } catch {
      return { error: 'linkedin_invalid' }
    }
    if (!LINKEDIN_HOST_RE.test(parsed.hostname)) return { error: 'linkedin_not_linkedin' }
    linkedin = parsed.toString()
  }

  return { name, email, linkedin }
}

// Calls reCAPTCHA siteverify and returns the parsed response. We treat
// any non-OK HTTP, JSON parse error, or missing fields as failure.
async function verifyRecaptcha(token: string, remoteIp?: string): Promise<{
  ok: boolean
  score?: number
  action?: string
  errorCodes?: string[]
}> {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return { ok: false, errorCodes: ['secret_not_configured'] }

  const params = new URLSearchParams({ secret, response: token })
  if (remoteIp) params.set('remoteip', remoteIp)

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) return { ok: false, errorCodes: [`siteverify_${res.status}`] }
    const body = (await res.json()) as SiteverifyResponse
    return {
      ok: Boolean(body.success),
      score: typeof body.score === 'number' ? body.score : undefined,
      action: typeof body.action === 'string' ? body.action : undefined,
      errorCodes: body['error-codes'],
    }
  } catch (err) {
    return { ok: false, errorCodes: [`network_${err instanceof Error ? err.message : 'unknown'}`] }
  }
}

// Daily JSONL file in the existing logs bucket. Same append-via-download-
// then-rewrite pattern logStore.ts uses; fine for visitor cardinality
// (low hundreds per day at most for an event demo).
async function appendVisitorRecord(rec: Record<string, unknown>): Promise<void> {
  if (!VISITOR_BUCKET) {
    // Local dev — skip persistence. Console hint so it's obvious nothing
    // is being kept; tests don't exercise this path.
    console.log('[visitor] skipped persistence (LOGS_BUCKET unset):', rec)
    return
  }
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage()
  const bucket = storage.bucket(VISITOR_BUCKET)
  const day = new Date().toISOString().slice(0, 10)
  const obj = bucket.file(`${VISITOR_PREFIX}/${day}.jsonl`)
  let existing = ''
  try {
    const [buf] = await obj.download()
    existing = buf.toString('utf8')
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code !== 404) throw err
  }
  const line = `${JSON.stringify(rec)}\n`
  await obj.save(existing + line, {
    contentType: 'application/x-ndjson',
    resumable: false,
    metadata: { cacheControl: 'no-store' },
  })
}

export interface HandleVisitorOptions {
  remoteIp?: string
  // Allow tests to inject a fake clock so JSONL records are deterministic.
  now?: () => Date
  // Allow tests to skip persistence regardless of LOGS_BUCKET.
  skipPersistence?: boolean
}

export async function handleVisitorRequest(
  body: VisitorRequestBody,
  opts: HandleVisitorOptions = {},
): Promise<VisitorOutcome> {
  const normalised = normaliseVisitor(body)
  if ('error' in normalised) {
    return { status: 400, body: { ok: false, error: normalised.error } }
  }

  const token = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : ''
  if (!token) return { status: 400, body: { ok: false, error: 'recaptcha_missing' } }

  const verify = await verifyRecaptcha(token, opts.remoteIp)
  if (!verify.ok) {
    return {
      status: 403,
      body: {
        ok: false,
        error: 'recaptcha_failed',
        detail: verify.errorCodes?.join(',') ?? 'unknown',
      },
    }
  }
  if (verify.action && verify.action !== EXPECTED_ACTION) {
    return { status: 403, body: { ok: false, error: 'recaptcha_action_mismatch' } }
  }
  if (typeof verify.score === 'number' && verify.score < SCORE_THRESHOLD) {
    return {
      status: 403,
      body: { ok: false, error: 'recaptcha_low_score', detail: String(verify.score) },
    }
  }

  const now = opts.now ? opts.now() : new Date()
  const record = {
    ts: now.toISOString(),
    name: normalised.name,
    email: normalised.email,
    ...(normalised.linkedin ? { linkedin: normalised.linkedin } : {}),
    recaptcha: {
      score: verify.score,
      action: verify.action,
    },
    ...(opts.remoteIp ? { remoteIp: opts.remoteIp } : {}),
  }

  if (!opts.skipPersistence) {
    try {
      await appendVisitorRecord(record)
    } catch (err) {
      console.error('[visitor] persistence failed', err)
      return { status: 500, body: { ok: false, error: 'persistence_failed' } }
    }
  }

  return { status: 200, body: { ok: true } }
}

// ─── Public config — site key only, never the secret ─────────────────────
export interface ConfigResponse {
  recaptcha: {
    siteKey: string
  }
}

export function getPublicConfig(): ConfigResponse {
  return {
    recaptcha: {
      siteKey: process.env.RECAPTCHA_SITE_KEY ?? '',
    },
  }
}
