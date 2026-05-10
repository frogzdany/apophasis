// reCAPTCHA v3 helper.
//
// Lazy-loads the grecaptcha SDK against the site key fetched from
// /api/config (so we don't bake a key into the JS bundle at build
// time and don't need a `docker build --build-arg` round-trip on
// rotations). All calls beyond the first share the same Promise so
// concurrent submits don't double-load the script.
//
// Tokens expire after ~2 minutes per Google's docs, so we always
// re-execute on the action — never cache the token.

const CONFIG_ENDPOINT = '/api/config'

interface PublicConfig {
  recaptcha?: { siteKey?: string }
}

interface GrecaptchaApi {
  ready: (cb: () => void) => void
  execute: (siteKey: string, options: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi
  }
}

let configPromise: Promise<PublicConfig> | null = null
let scriptPromise: Promise<GrecaptchaApi> | null = null

async function fetchConfig(): Promise<PublicConfig> {
  if (configPromise) return configPromise
  configPromise = fetch(CONFIG_ENDPOINT)
    .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : ({} as PublicConfig)))
    .catch(() => ({}) as PublicConfig)
  return configPromise
}

function loadScript(siteKey: string): Promise<GrecaptchaApi> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<GrecaptchaApi>((resolve, reject) => {
    const existing = window.grecaptcha
    if (existing) {
      resolve(existing)
      return
    }
    const tag = document.createElement('script')
    tag.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
    tag.async = true
    tag.defer = true
    tag.onload = () => {
      const api = window.grecaptcha
      if (!api) {
        reject(new Error('grecaptcha did not initialise'))
        return
      }
      api.ready(() => resolve(api))
    }
    tag.onerror = () => reject(new Error('failed to load reCAPTCHA script'))
    document.head.appendChild(tag)
  })
  return scriptPromise
}

export interface RecaptchaResult {
  ok: boolean
  token?: string
  reason?:
    | 'site_key_missing'
    | 'script_load_failed'
    | 'execute_failed'
    | 'unsupported_environment'
}

// Resolves the reCAPTCHA token for the given action. Never throws —
// callers should branch on `ok`. When site key isn't configured (e.g.
// dev-mode without RECAPTCHA_SITE_KEY in .env.local) returns
// `site_key_missing` so the visitor dialog can show a "skip" hint
// instead of a blocking error during local development.
export async function executeRecaptcha(action: string): Promise<RecaptchaResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, reason: 'unsupported_environment' }
  }
  const cfg = await fetchConfig()
  const siteKey = cfg.recaptcha?.siteKey
  if (!siteKey) return { ok: false, reason: 'site_key_missing' }
  let api: GrecaptchaApi
  try {
    api = await loadScript(siteKey)
  } catch {
    return { ok: false, reason: 'script_load_failed' }
  }
  try {
    const token = await api.execute(siteKey, { action })
    return { ok: true, token }
  } catch {
    return { ok: false, reason: 'execute_failed' }
  }
}

// Test-only reset hook — clears the cached promises so a fresh stub of
// window.grecaptcha + a fresh fetch mock take effect. Intentionally
// not exported under a `__test__` namespace; the cost of a public
// export is one extra symbol in the bundle.
export function _resetRecaptchaForTests(): void {
  configPromise = null
  scriptPromise = null
}
