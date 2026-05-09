// Streams Gemini's PCM16 24 kHz audio chunks gaplessly into Web Audio.
export class AudioStreamer extends EventTarget {
  ctx: AudioContext | null = null
  nextStartTime = 0
  sources = new Set<AudioBufferSourceNode>()

  ensureContext(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 24000 })
      this.nextStartTime = 0
    }
  }

  async resume(): Promise<void> {
    this.ensureContext()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
  }

  push(int16Array: Int16Array): void {
    this.ensureContext()
    const ctx = this.ctx
    if (!ctx) return
    const float32 = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      const s = int16Array[i]
      float32[i] = s / (s < 0 ? 0x8000 : 0x7fff)
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const t = Math.max(ctx.currentTime, this.nextStartTime)
    source.start(t)
    this.nextStartTime = t + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      if (this.sources.size === 0) this.dispatchEvent(new Event('idle'))
    }
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* noop */
      }
    }
    this.sources.clear()
    this.nextStartTime = 0
  }

  close(): void {
    this.stop()
    this.ctx?.close()
    this.ctx = null
  }
}

export function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(bin)
}
