// Phase-accumulator resampler from AudioContext sampleRate to 16 kHz, then
// Float32 → little-endian Int16. Posts chunks of 2048 samples (~128 ms) plus
// per-quantum RMS for the mic-level meter and per-chunk peak for debugging.
//
// This file ships verbatim to the browser as an AudioWorklet module — Vite
// emits it as a hashed static asset via the `?url` import in recorder.ts.
// Plain JS (no TS) so the browser's worklet loader can execute it directly.

const TARGET_RATE = 16000
const CHUNK_SAMPLES = 2048

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE
    this.phase = 0
    this.lastSample = 0
    this.buf = []
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const ch = input[0]

    let sum = 0
    for (let j = 0; j < ch.length; j++) sum += ch[j] * ch[j]
    const rms = Math.sqrt(sum / ch.length)
    this.port.postMessage({ type: 'level', rms })

    for (let j = 0; j < ch.length; j++) {
      this.phase += 1
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio
        const f = this.phase / this.ratio
        this.buf.push(this.lastSample * f + ch[j] * (1 - f))
      }
      this.lastSample = ch[j]
    }

    while (this.buf.length >= CHUNK_SAMPLES) {
      const samples = this.buf.splice(0, CHUNK_SAMPLES)
      const int16 = new Int16Array(CHUNK_SAMPLES)
      let peak = 0
      for (let k = 0; k < CHUNK_SAMPLES; k++) {
        const s = Math.max(-1, Math.min(1, samples[k]))
        if (Math.abs(s) > peak) peak = Math.abs(s)
        int16[k] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.port.postMessage(
        { type: 'chunk', buffer: int16.buffer, peak },
        [int16.buffer],
      )
    }

    return true
  }
}

registerProcessor('recorder-worklet', RecorderProcessor)
