// Node-side TTS bridge for the validate-ui --tts mode.
//
// Mirrors src/lib/ttsBridge.ts but runs in Bun (no DOM, no fetch to a
// local server): we call Gemini's TTS endpoint directly via @google/genai
// and pump frames into a LiveSession via sendAudioChunk + sendAudioStreamEnd.
//
// The framing math matches the browser worklet exactly: 2048-sample
// Int16 chunks at 16 kHz, ~128 ms per frame.

import { GoogleGenAI } from '@google/genai'
import type { LiveSession } from '@/gemini/liveSession'

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? 'gemini-3.1-flash-tts-preview'
const DEFAULT_VOICE = 'Kore'
const TARGET_RATE = 16000
const FRAME_SAMPLES = 2048

let aiClient: GoogleGenAI | null = null

function getClient(apiKey: string): GoogleGenAI {
  if (aiClient) return aiClient
  aiClient = new GoogleGenAI({ apiKey } as ConstructorParameters<typeof GoogleGenAI>[0])
  return aiClient
}

export interface TtsResult {
  pcm16k: Int16Array
  durationSec: number
}

// Synthesise a text turn into Int16 PCM at 16 kHz mono. Caller frames it
// into the Live session.
export async function synthesiseToPcm(
  text: string,
  apiKey: string,
  voice = DEFAULT_VOICE,
): Promise<TtsResult> {
  const ai = getClient(apiKey)
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `Read this aloud naturally: ${text}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  } as unknown as Parameters<typeof ai.models.generateContent>[0])

  const part = response?.candidates?.[0]?.content?.parts?.[0]
  const data = part?.inlineData?.data
  if (!data || typeof data !== 'string') {
    throw new Error('TTS response missing inlineData (model returned text tokens?)')
  }
  const pcm24k = base64ToInt16(data)
  const pcm16k = downsampleLinear(pcm24k, 24000, TARGET_RATE)
  return { pcm16k, durationSec: pcm16k.length / TARGET_RATE }
}

// Frame Int16 PCM @ 16 kHz into 128 ms ArrayBuffer chunks and feed them
// into the session, then mark end-of-turn so VAD doesn't have to wait for
// trailing silence. Awaits the full synthesise + stream loop so the
// caller can immediately await turnComplete after this resolves.
export async function streamTtsToSession(
  text: string,
  session: LiveSession,
  apiKey: string,
  voice = DEFAULT_VOICE,
): Promise<void> {
  const { pcm16k } = await synthesiseToPcm(text, apiKey, voice)
  const frameMs = (FRAME_SAMPLES / TARGET_RATE) * 1000
  for (let off = 0; off < pcm16k.length; off += FRAME_SAMPLES) {
    const end = Math.min(off + FRAME_SAMPLES, pcm16k.length)
    const slice = pcm16k.slice(off, end)
    const out = slice.length === FRAME_SAMPLES ? slice : padTo(slice, FRAME_SAMPLES)
    const ab = new ArrayBuffer(out.byteLength)
    new Int16Array(ab).set(out)
    session.sendAudioChunk(ab)
    await sleep(frameMs)
  }
  session.sendAudioStreamEnd()
}

function padTo(slice: Int16Array, length: number): Int16Array {
  const out = new Int16Array(length)
  out.set(slice, 0)
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function base64ToInt16(b64: string): Int16Array {
  const buf = Buffer.from(b64, 'base64')
  // Buffer is byte-oriented; reinterpret as little-endian Int16.
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
}

function downsampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Int16Array(outLength)
  let phase = 0
  let lastSample = 0
  let writeIdx = 0
  for (let i = 0; i < input.length && writeIdx < outLength; i++) {
    phase += 1
    if (phase >= ratio) {
      phase -= ratio
      const f = phase / ratio
      const blended = lastSample * f + input[i] * (1 - f)
      out[writeIdx++] = clampToInt16(blended)
    }
    lastSample = input[i]
  }
  return out
}

function clampToInt16(v: number): number {
  if (v >= 32767) return 32767
  if (v <= -32768) return -32768
  return v | 0
}
