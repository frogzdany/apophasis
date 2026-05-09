// Server-side Text-to-Speech proxy. Powers the text-input demo flow:
//   POST /api/tts  { text, voice?, languageCode? }  →  { audioBase64, sampleRate, mimeType }
//
// Calls gemini-3.1-flash-tts-preview (or the override in GEMINI_TTS_MODEL),
// returns the raw 16-bit PCM @ 24 kHz mono so the browser can resample to
// 16 kHz and stream it into the Live session as if it were mic input. The
// upstream key (GEMINI_API_KEY) lives in Secret Manager and never reaches
// the browser.
//
// Why this round-trip: the Live model rejects responseModalities:[TEXT],
// so the cheapest way to drive a Live session with typed input AND keep
// the production audio path identical (VAD, decoder, tool-call timing) is
// to synthesise speech and feed it back in.

import { GoogleGenAI } from '@google/genai'

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? 'gemini-3.1-flash-tts-preview'
const DEFAULT_VOICE = 'Kore'

// Per the TTS docs the model emits 16-bit PCM @ 24 kHz mono.
const TTS_SAMPLE_RATE = 24000
const TTS_MIME_TYPE = `audio/pcm;rate=${TTS_SAMPLE_RATE}`

let aiClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (aiClient) return aiClient
  // Server-side key is canonical; fall back to VITE_GEMINI_API_KEY for the
  // common dev case where only the browser-fallback variable exists in
  // .env.local (matches the convention documented in .env.example).
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY not set on the server. In Cloud Run this is wired ' +
        'from Secret Manager — see infra/main.tf.',
    )
  }
  aiClient = new GoogleGenAI({ apiKey } as ConstructorParameters<typeof GoogleGenAI>[0])
  return aiClient
}

export interface TtsRequest {
  text?: unknown
  voice?: unknown
}

export interface TtsResponse {
  audioBase64: string
  sampleRate: number
  mimeType: string
  model: string
}

const MAX_TEXT_LEN = 2000

// One automatic retry on a 500 — TTS preview occasionally returns text
// tokens instead of audio and surfaces that as a 500 (documented in the
// "Limitations" section of the TTS guide).
const TTS_RETRIES = 1

export async function handleTtsRequest(
  body: TtsRequest,
): Promise<{ status: number; body: TtsResponse | { error: string } }> {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return { status: 400, body: { error: 'text is required' } }
  }
  if (text.length > MAX_TEXT_LEN) {
    return { status: 400, body: { error: `text exceeds ${MAX_TEXT_LEN} chars` } }
  }
  const voice = typeof body.voice === 'string' && body.voice ? body.voice : DEFAULT_VOICE

  let lastErr: unknown
  for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
    try {
      const audioBase64 = await synthesise(text, voice)
      return {
        status: 200,
        body: {
          audioBase64,
          sampleRate: TTS_SAMPLE_RATE,
          mimeType: TTS_MIME_TYPE,
          model: TTS_MODEL,
        },
      }
    } catch (err) {
      lastErr = err
      const status = (err as { status?: number } | null)?.status
      // Only retry on 5xx; anything else (400/403/quota) is terminal.
      if (status && status >= 500 && attempt < TTS_RETRIES) continue
      break
    }
  }

  console.error('[tts] synthesise failed', lastErr)
  return {
    status: 500,
    body: { error: lastErr instanceof Error ? lastErr.message : String(lastErr) },
  }
}

async function synthesise(text: string, voice: string): Promise<string> {
  const ai = getClient()
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    // Preamble nudges the prompt classifier toward "synthesise speech" —
    // documented mitigation for occasional PROHIBITED_CONTENT rejections
    // on bare prompts.
    contents: [{ parts: [{ text: `Read this aloud naturally: ${text}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  } as unknown as Parameters<typeof ai.models.generateContent>[0])

  const part = response?.candidates?.[0]?.content?.parts?.[0]
  const data = part?.inlineData?.data
  if (!data || typeof data !== 'string') {
    const err = new Error('TTS response missing inlineData (model returned text tokens?)')
    ;(err as { status?: number }).status = 500
    throw err
  }
  return data
}
