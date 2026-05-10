import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleVisitorRequest } from '../../server/visitorProxy'

const VALID_INPUT = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  recaptchaToken: 'tok-abc',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function siteverifyOk(score = 0.9, action = 'visitor_register'): Response {
  return jsonResponse({ success: true, score, action })
}

describe('handleVisitorRequest — input validation', () => {
  beforeEach(() => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'test-secret')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(siteverifyOk()))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects missing name', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, name: '' },
      { skipPersistence: true },
    )
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ ok: false, error: 'name_required' })
  })

  it('rejects missing email', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, email: undefined },
      { skipPersistence: true },
    )
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ ok: false, error: 'email_required' })
  })

  it('rejects malformed email', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, email: 'not-an-email' },
      { skipPersistence: true },
    )
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ ok: false, error: 'email_invalid' })
  })

  it('rejects a non-LinkedIn URL when LinkedIn is provided', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, linkedin: 'https://example.com/in/me' },
      { skipPersistence: true },
    )
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ ok: false, error: 'linkedin_not_linkedin' })
  })

  it('accepts a bare LinkedIn URL without scheme', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, linkedin: 'linkedin.com/in/ada' },
      { skipPersistence: true },
    )
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ ok: true })
  })

  it('rejects when recaptchaToken is missing', async () => {
    const out = await handleVisitorRequest(
      { ...VALID_INPUT, recaptchaToken: undefined },
      { skipPersistence: true },
    )
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ ok: false, error: 'recaptcha_missing' })
  })
})

describe('handleVisitorRequest — reCAPTCHA verification', () => {
  beforeEach(() => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'test-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns 200 with a passing siteverify response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(siteverifyOk(0.92))
    vi.stubGlobal('fetch', fetchMock)

    const out = await handleVisitorRequest(VALID_INPUT, { skipPersistence: true })

    expect(out.status).toBe(200)
    expect(out.body).toEqual({ ok: true })
    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('recaptcha/api/siteverify')
    expect(init?.method).toBe('POST')
  })

  it('returns 403 when siteverify reports success=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] })),
    )
    const out = await handleVisitorRequest(VALID_INPUT, { skipPersistence: true })
    expect(out.status).toBe(403)
    expect(out.body).toMatchObject({ ok: false, error: 'recaptcha_failed' })
  })

  it('returns 403 when score < 0.5', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(siteverifyOk(0.2)))
    const out = await handleVisitorRequest(VALID_INPUT, { skipPersistence: true })
    expect(out.status).toBe(403)
    expect(out.body).toMatchObject({ ok: false, error: 'recaptcha_low_score' })
  })

  it('returns 403 when action does not match visitor_register', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(siteverifyOk(0.9, 'something_else')),
    )
    const out = await handleVisitorRequest(VALID_INPUT, { skipPersistence: true })
    expect(out.status).toBe(403)
    expect(out.body).toMatchObject({ ok: false, error: 'recaptcha_action_mismatch' })
  })

  it('returns 403 with secret_not_configured when RECAPTCHA_SECRET_KEY is unset', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '')
    vi.stubGlobal('fetch', vi.fn())
    const out = await handleVisitorRequest(VALID_INPUT, { skipPersistence: true })
    expect(out.status).toBe(403)
    expect(out.body).toMatchObject({
      ok: false,
      error: 'recaptcha_failed',
      detail: 'secret_not_configured',
    })
  })
})
