// Mints short-lived ephemeral auth tokens for the browser to open a Gemini
// Live WebSocket without ever seeing the long-lived API key.
//
// The token is locked to a single model + the full session config built by
// src/gemini/liveConfig.ts. Because liveConnectConstraints with a config
// payload causes the Live API to drop ANY client-supplied config field that
// isn't in the constraints, the constraints have to mirror the browser's
// live.connect() config exactly. Hence the shared buildLiveConfig builder
// — same source of truth on both sides.
//
// See https://ai.google.dev/gemini-api/docs/ephemeral-tokens

import { GoogleGenAI } from '@google/genai'
import type { UserLocation } from '../src/lib/geolocation'
import type { Language } from '../src/lib/messages'
import {
  buildLiveConfig,
  LIVE_MODEL,
  VOICE_NAMES,
  type VoiceName,
} from '../src/gemini/liveConfig'

const TOKEN_TTL_MS = 30 * 60_000 // overall token validity
const NEW_SESSION_WINDOW_MS = 2 * 60_000 // time the browser has to *open* a session

// Voices the client is allowed to request, sourced from the same allowlist
// the UI uses. Anything outside this set falls back to DEFAULT_VOICE.
const VALID_VOICES: ReadonlySet<VoiceName> = new Set(VOICE_NAMES)
const VALID_LANGUAGES: ReadonlySet<Language> = new Set(['en', 'es'])
const DEFAULT_VOICE: VoiceName = 'Aoede'
const DEFAULT_LANGUAGE: Language = 'en'

export interface MintOptions {
  voice?: string
  language?: string
  userLocation?: UserLocation | null
}

// Validates that a client-supplied user location object is a sane
// { lat, lng, label?, accuracy? } shape before we bake it into the
// systemInstruction. Returns null on any malformed input — never throws.
function sanitizeUserLocation(input: unknown): UserLocation | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 200) : undefined
  const accuracy = Number(raw.accuracy)
  return {
    lat,
    lng,
    ...(label ? { label } : {}),
    ...(Number.isFinite(accuracy) ? { accuracy } : {}),
  }
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

  const voice: VoiceName =
    opts.voice && VALID_VOICES.has(opts.voice as VoiceName)
      ? (opts.voice as VoiceName)
      : DEFAULT_VOICE
  const language: Language =
    opts.language && VALID_LANGUAGES.has(opts.language as Language)
      ? (opts.language as Language)
      : DEFAULT_LANGUAGE

  // The full Live config — system instruction, tools, toolConfig, VAD, etc.
  // — must live INSIDE the constraints, not just in the browser's
  // live.connect call. Whatever the browser tries to add via live.connect is
  // silently dropped when constraints are present. buildLiveConfig is the
  // single source of truth used by both call sites.
  const userLocation = sanitizeUserLocation(opts.userLocation)
  const liveConfig = buildLiveConfig({ language, voiceName: voice, userLocation })

  // SDK types for authTokens lag the API; cast through a minimal shape.
  const tokensApi = (
    ai as unknown as { authTokens: { create: (p: unknown) => Promise<{ name?: string }> } }
  ).authTokens

  const created = await tokensApi.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model: LIVE_MODEL,
        config: liveConfig,
      },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  })

  if (!created?.name) {
    throw new Error('authTokens.create returned no token name')
  }

  return { token: created.name, expiresAt: expireTime, model: LIVE_MODEL }
}
