// Wraps the recorder AudioWorklet. Emits 'chunk' events (ArrayBuffer of Int16
// PCM @ 16 kHz) and 'level' events (RMS 0..1). Caller subscribes via
// addEventListener.

// Worklet ships from public/audio/recorder-worklet.js — Vite copies that
// directory verbatim to the dist root, so we reference it by absolute URL
// and skip the bundler's inlining heuristics (which were turning the
// worklet into a data: URL that AudioWorklet refused to load).
const RECORDER_WORKLET_URL = '/audio/recorder-worklet.js'

export class AudioRecorder extends EventTarget {
  ctx: AudioContext | null = null
  stream: MediaStream | null = null
  node: AudioWorkletNode | null = null
  muteGain: GainNode | null = null
  private chunkCount = 0

  async start({ deviceId }: { deviceId?: string } = {}): Promise<void> {
    if (this.ctx) return
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (deviceId && deviceId !== 'default') {
      audioConstraints.deviceId = { exact: deviceId }
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    const track = this.stream.getAudioTracks()[0]
    console.log('[lucy] mic track', {
      label: track?.label,
      settings: track?.getSettings?.(),
    })
    this.ctx = new AudioContext()
    await this.ctx.audioWorklet.addModule(RECORDER_WORKLET_URL)
    const src = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'recorder-worklet')
    this.chunkCount = 0
    this.node.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'chunk') {
        this.chunkCount += 1
        if (this.chunkCount <= 5 || this.chunkCount % 40 === 0) {
          console.log('[lucy] chunk peak', msg.peak.toFixed(3), '#', this.chunkCount)
        }
        this.dispatchEvent(new CustomEvent('chunk', { detail: msg.buffer as ArrayBuffer }))
      } else if (msg.type === 'level') {
        this.dispatchEvent(new CustomEvent('level', { detail: msg.rms as number }))
      }
    }
    this.muteGain = this.ctx.createGain()
    this.muteGain.gain.value = 0
    src.connect(this.node)
    this.node.connect(this.muteGain)
    this.muteGain.connect(this.ctx.destination)
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => {
      t.stop()
    })
    this.node?.disconnect()
    this.muteGain?.disconnect()
    this.ctx?.close()
    this.ctx = null
    this.stream = null
    this.node = null
    this.muteGain = null
  }
}
