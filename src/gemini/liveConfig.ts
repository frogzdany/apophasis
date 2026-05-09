// Single source of truth for the Gemini Live session config.
//
// Both call sites use this builder so adding a tool / tweaking VAD / adding a
// new top-level config field is a one-place change:
//
//   • Browser side — src/gemini/liveSession.ts → ai.live.connect({ config: ... })
//   • Server side  — server/geminiToken.ts     → liveConnectConstraints.config
//
// The reason the server cares: when an ephemeral token has
// `liveConnectConstraints` set, the Live API treats those constraints'
// config as the *complete* session config and silently drops anything the
// browser tries to add via live.connect. So whatever we want the model to
// honor in production (system instruction, tools, toolConfig, VAD,
// transcription, voice) MUST be in the constraints — not just on the
// client. Drift between the two paths is exactly how today's "no UI in
// prod" and yesterday's "all voices sound male" bugs happened.
//
// Stays free of side effects so the Bun-runtime server can import it
// directly. SDK enums (Modality, FunctionCallingConfigMode) are imported
// for typing; their string-literal values are what actually goes on the
// wire.

import { FunctionCallingConfigMode, Modality } from '@google/genai'
import type { Language } from '@/lib/messages'
import { APOPHASIS_TOOLS } from './tools'
import { SYSTEM_INSTRUCTIONS } from './systemInstructions'

// Latin-American Spanish voice pairing. 'es-US' generally produces the
// warmest LATAM-leaning output across Gemini's prebuilt voices.
export const LANGUAGE_CODES: Record<Language, string> = {
  en: 'en-US',
  es: 'es-US',
}

export const LIVE_MODEL = 'gemini-3.1-flash-live-preview'

// All prebuilt voices Gemini Live supports. Lives here (not in
// liveSession.ts) so the server-side token mint can validate untrusted
// client input against the same allowlist the UI exposes — closing the
// last drift point between the two paths. UI labels for each voice live
// in liveSession.ts (VOICE_DESCRIPTIONS), since they're rendering text.
export const VOICE_NAMES = [
  'Aoede',
  'Charon',
  'Fenrir',
  'Kore',
  'Leda',
  'Orus',
  'Puck',
  'Zephyr',
] as const

export type VoiceName = (typeof VOICE_NAMES)[number]

export interface LiveConfigOptions {
  language: Language
  voiceName: VoiceName
}

// Builds the full Live config payload. Both sites cast through to the SDK
// shape because the SDK's LiveConnectConfig type is missing toolConfig (the
// server still accepts it) and authTokens' constraints are typed loosely.
export function buildLiveConfig({ language, voiceName }: LiveConfigOptions) {
  const allowedFunctionNames = APOPHASIS_TOOLS.map((t) => t.name).filter(
    (n): n is string => typeof n === 'string',
  )

  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: SYSTEM_INSTRUCTIONS[language],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [{ functionDeclarations: APOPHASIS_TOOLS }],
    toolConfig: {
      // Forces a function call every turn. respond_in_voice is the no-op
      // fallback for chit-chat. Without ANY mode the model drifts back into
      // prose and stops calling render_surface.
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames,
      },
    },
    speechConfig: {
      languageCode: LANGUAGE_CODES[language],
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    },
    // Tighter VAD (350ms silence, 50ms prefix) so Lucy starts replying
    // sooner after the user stops talking. Going below ~300ms tends to cut
    // users off mid-pause.
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
        silenceDurationMs: 350,
        prefixPaddingMs: 50,
      },
    },
  }
}
