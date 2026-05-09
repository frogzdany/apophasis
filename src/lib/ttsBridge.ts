// Browser-side helper that bridges the text-input demo flow to the Live
// session. Fetches TTS audio from /api/tts, downsamples 24 kHz → 16 kHz,
// frames into ArrayBuffer chunks the size the recorder worklet emits, then
// hands them to a caller-supplied pumper. Mic is NOT involved — the audio
// looks identical to mic frames once it hits sendRealtimeInput.

const TARGET_RATE = 16000
const FRAME_SAMPLES = 2048 // matches public/audio/recorder-worklet.js
// 2048 samples @ 16 kHz = 128 ms per frame.
const FRAME_INTERVAL_MS = (FRAME_SAMPLES / TARGET_RATE) * 1000

export interface TtsBridgePump {
  /** Called once per ~128 ms frame. Implementation should forward to the
   * Live session's sendAudioChunk (which expects a little-endian Int16 PCM
   * buffer at 16 kHz mono). */
  onChunk(chunk: ArrayBuffer): void
  /** Called once after the last chunk has been emitted, so the caller can
   * mark the user turn as ended (sendRealtimeInput({ audioStreamEnd: true }))
   * instead of waiting for server VAD to find silence. */
  onEnd?(): void
}

export interface SynthesisedAudio {
  /** Int16 PCM @ 16 kHz mono, ready to be framed. */
  pcm16k: Int16Array
  model: string
  /** Wall-clock duration of the audio in seconds. */
  durationSec: number
}

export async function fetchTts(text: string, voice = 'Kore'): Promise<SynthesisedAudio> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* ignore */
    }
    throw new Error(`/api/tts failed: ${detail}`)
  }
  const payload = (await res.json()) as {
    audioBase64: string
    sampleRate: number
    model: string
  }
  if (!payload.audioBase64) throw new Error('/api/tts returned no audio')

  const pcmInput = base64ToInt16(payload.audioBase64)
  const pcm16k =
    payload.sampleRate === TARGET_RATE
      ? pcmInput
      : downsampleLinear(pcmInput, payload.sampleRate, TARGET_RATE)
  return {
    pcm16k,
    model: payload.model,
    durationSec: pcm16k.length / TARGET_RATE,
  }
}

/** Frames Int16 PCM @ 16 kHz into recorder-worklet-sized chunks and pumps
 * them on a real-time-ish cadence. Returns a promise that resolves once the
 * whole buffer has been streamed (so callers can await before calling
 * sendAudioStreamEnd / submitting a follow-up). */
export async function streamPcm16(pcm: Int16Array, pump: TtsBridgePump): Promise<void> {
  for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
    const end = Math.min(offset + FRAME_SAMPLES, pcm.length)
    const slice = pcm.slice(offset, end)
    // Last partial frame: pad with silence so the buffer length matches what
    // the worklet would emit (the Live API tolerates partial frames, but
    // matching keeps server-side framing predictable).
    const out = slice.length === FRAME_SAMPLES ? slice : padTo(slice, FRAME_SAMPLES)
    // Allocate a fresh ArrayBuffer so the SDK can keep the reference (the
    // typed array's underlying buffer can be a SharedArrayBuffer in some
    // environments and isn't assignable to ArrayBuffer).
    const ab = new ArrayBuffer(out.byteLength)
    new Int16Array(ab).set(out)
    pump.onChunk(ab)
    // Pace at frame duration. Without this the whole buffer flushes in one
    // tick and the server VAD interprets it as a single tightly-packed
    // utterance — works, but ignoring real-time pacing makes Lucy's
    // response feel artificially eager.
    await sleep(FRAME_INTERVAL_MS)
  }
  pump.onEnd?.()
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
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // The TTS model emits little-endian 16-bit PCM. Reinterpret with the
  // current byteOffset; standard browsers are LE so the underlying bytes
  // already match Int16Array's view.
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
}

// Phase-accumulator linear resampler — same scheme the recorder worklet
// uses, just in reverse (24k → 16k instead of 48k → 16k). Good enough for
// speech intelligibility; not studio-grade.
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
      // Linear blend across the sample boundary.
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
