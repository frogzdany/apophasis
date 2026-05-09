// Mints short-lived ephemeral auth tokens for the browser to open a Gemini
// Live WebSocket without ever seeing the long-lived API key.
//
// The token is locked to a single model and a single new-session window so a
// stolen token is useful only for a fresh connection within a short window.
// See https://ai.google.dev/gemini-api/docs/ephemeral-tokens

import { GoogleGenAI } from '@google/genai'

const TOKEN_TTL_MS = 30 * 60_000 // overall token validity
const NEW_SESSION_WINDOW_MS = 2 * 60_000 // time the browser has to *open* a session

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview'

// Voices and languages the client is allowed to request. Anything outside
// these allowlists falls back to a safe default. Keep in sync with
// src/gemini/liveSession.ts.
const VALID_VOICES = new Set([
  'Aoede',
  'Charon',
  'Fenrir',
  'Kore',
  'Leda',
  'Orus',
  'Puck',
  'Zephyr',
])
const LANGUAGE_CODES: Record<string, string> = {
  en: 'en-US',
  es: 'es-US',
}
const DEFAULT_VOICE = 'Aoede'
const DEFAULT_LANGUAGE = 'en'

export interface MintOptions {
  voice?: string
  language?: string
}

// One client per process; safe to reuse across requests.
let aiClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (aiClient) return aiClient
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY not set on the server. In Cloud Run this is wired ' +
        'from Secret Manager — see infra/main.tf.',
    )
  }
  aiClient = new GoogleGenAI({
    apiKey,
    // Ephemeral tokens are exposed under the v1alpha API version.
    httpOptions: { apiVersion: 'v1alpha' },
  } as ConstructorParameters<typeof GoogleGenAI>[0])
  return aiClient
}

export interface MintedToken {
  token: string
  expiresAt: string
  model: string
}

export async function mintEphemeralToken(opts: MintOptions = {}): Promise<MintedToken> {
  const ai = getClient()
  const now = Date.now()
  const expireTime = new Date(now + TOKEN_TTL_MS).toISOString()
  const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString()

  // Live API treats `liveConnectConstraints` as the source of truth — any
  // client-side config that wasn't in the constraints is silently dropped.
  // So speechConfig (voice + language) MUST be baked into the token here,
  // otherwise the API falls back to a default voice regardless of what the
  // browser asked for.
  const voice = opts.voice && VALID_VOICES.has(opts.voice) ? opts.voice : DEFAULT_VOICE
  const langKey = opts.language && opts.language in LANGUAGE_CODES ? opts.language : DEFAULT_LANGUAGE
  const languageCode = LANGUAGE_CODES[langKey]

  // SDK types for authTokens lag the API; cast through a minimal shape.
  const tokensApi = (ai as unknown as { authTokens: { create: (p: unknown) => Promise<{ name?: string }> } })
    .authTokens

  const created = await tokensApi.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model: LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  })

  if (!created?.name) {
    throw new Error('authTokens.create returned no token name')
  }

  return { token: created.name, expiresAt: expireTime, model: LIVE_MODEL }
}
