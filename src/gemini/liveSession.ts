import {
  type FunctionCall,
  type FunctionResponse,
  GoogleGenAI,
  type Session,
} from '@google/genai'
import { arrayBufferToBase64, base64ToInt16 } from '@/audio/player'
import type { Language } from '@/lib/messages'
import { logEvent } from '@/lib/sessionLogger'
import { buildLiveConfig, LIVE_MODEL, VOICE_NAMES, type VoiceName } from './liveConfig'

// Re-exported so existing imports (`@/gemini/liveSession`) keep working.
// Canonical home is liveConfig.ts, where the server can also see them.
export { VOICE_NAMES, type VoiceName }

export const VOICE_DESCRIPTIONS: Record<VoiceName, string> = {
  Aoede: 'Warm, conversational',
  Charon: 'Deep, measured',
  Fenrir: 'Energetic, bright',
  Kore: 'Clear, neutral',
  Leda: 'Light, lyrical',
  Orus: 'Firm, grounded',
  Puck: 'Playful, lifted',
  Zephyr: 'Smooth, breathy',
}

// Thin wrapper around ai.live.connect. Surfaces incoming audio + turn
// lifecycle as plain callbacks; caller doesn't need to know about the SDK.
//
// The harness in scripts/validate-ui/ reuses this class as-is: it skips
// the AudioRecorder + AudioStreamer wiring, drives user turns via
// sendUserText (same path production uses for surface submissions), and
// listens for toolCall / outputTranscript / turnComplete. The audio bytes
// arrive over the same socket but get ignored.
//
// We tried responseModalities: [TEXT] but gemini-3.1-flash-live-preview
// rejects it with a 1011 Internal Error (only AUDIO is supported on this
// model). See https://github.com/googleapis/python-genai/issues/2238.
export class LiveSession extends EventTarget {
  private ai: GoogleGenAI
  private session: Session | null = null
  private language: Language
  private voiceName: VoiceName
  connected = false

  constructor({
    apiKey,
    language,
    voiceName,
  }: {
    // Long-lived API key (dev / harness) OR a short-lived ephemeral token
    // name minted by the backend (prod). Both are passed via the SDK's
    // `apiKey` slot; ephemeral tokens additionally require apiVersion:
    // 'v1alpha'.
    apiKey: string
    language: Language
    voiceName: VoiceName
  }) {
    super()
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    } as ConstructorParameters<typeof GoogleGenAI>[0])
    this.language = language
    this.voiceName = voiceName
  }

  async connect(): Promise<void> {
    console.log('[lucy] connecting', {
      model: LIVE_MODEL,
      language: this.language,
      voice: this.voiceName,
    })
    try {
      // Single source of truth for the Live config — see src/gemini/liveConfig.ts.
      // The same builder runs server-side in geminiToken.ts to bake the
      // exact same shape into the ephemeral token's liveConnectConstraints.
      const liveConfig = buildLiveConfig({
        language: this.language,
        voiceName: this.voiceName,
      }) as unknown as Parameters<typeof this.ai.live.connect>[0]['config']

      this.session = await this.ai.live.connect({
        model: LIVE_MODEL,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            console.log('[lucy] session OPEN')
            this.connected = true
            this.dispatchEvent(new Event('open'))
          },
          onmessage: (msg) => this.onMessage(msg),
          onerror: (e) => {
            console.error('[lucy] session ERROR', e)
            this.dispatchEvent(new CustomEvent('error', { detail: e }))
          },
          onclose: (e) => {
            console.log('[lucy] session CLOSE', e?.reason ?? '')
            this.connected = false
            this.dispatchEvent(new Event('close'))
          },
        },
      })
    } catch (e) {
      console.error('[lucy] connect threw', e)
      throw e
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: SDK message shape is loose
  private onMessage(msg: any): void {
    console.log('[lucy] msg', msg)

    const content = msg?.serverContent
    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          const int16 = base64ToInt16(part.inlineData.data)
          this.dispatchEvent(new CustomEvent('audio', { detail: int16 }))
        }
      }
    }
    if (content?.inputTranscription?.text) {
      this.dispatchEvent(
        new CustomEvent('inputTranscript', { detail: content.inputTranscription.text }),
      )
    }
    if (content?.outputTranscription?.text) {
      this.dispatchEvent(
        new CustomEvent('outputTranscript', { detail: content.outputTranscription.text }),
      )
    }
    if (content?.turnComplete) {
      console.log('[lucy] turnComplete')
      this.dispatchEvent(new Event('turnComplete'))
    }
    if (content?.interrupted) {
      console.log('[lucy] interrupted')
      this.dispatchEvent(new Event('interrupted'))
    }

    // Tool calls — fan each function call out as its own event so the hook
    // can route by name.
    const toolCall = msg?.toolCall as { functionCalls?: FunctionCall[] } | undefined
    if (toolCall?.functionCalls) {
      for (const fc of toolCall.functionCalls) {
        console.log('[lucy] toolCall', fc.name, fc.args)
        logEvent('toolCall', { name: fc.name, id: fc.id, args: fc.args })
        this.dispatchEvent(new CustomEvent('toolCall', { detail: fc }))
      }
    }
  }

  sendAudioChunk(arrayBuffer: ArrayBuffer): void {
    if (!this.session || !this.connected) return
    this.session.sendRealtimeInput({
      audio: {
        data: arrayBufferToBase64(arrayBuffer),
        mimeType: 'audio/pcm;rate=16000',
      },
    })
  }

  // Marks the end of a synthesised audio turn so server VAD doesn't have to
  // wait for trailing silence to detect end-of-speech. Used by the text
  // demo path after the last TTS frame is pushed; the regular mic path
  // doesn't call this — server VAD handles natural end-of-utterance there.
  sendAudioStreamEnd(): void {
    if (!this.session || !this.connected) return
    this.session.sendRealtimeInput({ audioStreamEnd: true } as Parameters<
      typeof this.session.sendRealtimeInput
    >[0])
  }

  sendToolResponse(responses: FunctionResponse[]): void {
    if (!this.session || !this.connected) return
    console.log('[lucy] sendToolResponse', responses)
    logEvent('toolResponse', responses)
    this.session.sendToolResponse({ functionResponses: responses })
  }

  // Synthesises a user turn from the surface submission. The toolCall that
  // opened the surface was already acked, so we cannot reuse its fcId — we
  // give Gemini a fresh user input and let her decide whether to refine,
  // search, or just acknowledge.
  sendUserText(text: string): void {
    if (!this.session || !this.connected) return
    console.log('[lucy] sendUserText', text)
    logEvent('userText', { text })
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    })
  }

  close(): void {
    try {
      this.session?.close()
    } catch {
      /* noop */
    }
    this.session = null
    this.connected = false
  }
}
