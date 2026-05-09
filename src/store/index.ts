import { create } from 'zustand'
import { VOICE_NAMES, type VoiceName } from '@/gemini/liveSession'
import type { UserLocation } from '@/lib/geolocation'
import { LANGUAGES, type Language } from '@/lib/messages'
import type { SearchResult } from '@/lib/search/types'

// Lifecycle of the geolocation prompt: 'idle' (never asked / cleared),
// 'requesting' (browser prompt up), 'granted' (we have coords; reverse
// geocode may still be in flight, see UserLocation.label), 'denied' /
// 'unavailable' / 'timeout' / 'unsupported' (terminal failure modes;
// the LocationToggle pill renders the matching copy).
export type UserLocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'

export const PHASES = ['idle', 'listening', 'thinking', 'asking', 'result'] as const
export type Phase = (typeof PHASES)[number]

const LITE_KEY = 'lucy:lite'
const MIC_KEY = 'lucy:micId'
const LANG_KEY = 'lucy:lang'
const VOICE_KEY = 'lucy:voice'
const INPUT_MODE_KEY = 'lucy:inputMode'

export type InputMode = 'voice' | 'text'

function readInitialInputMode(): InputMode {
  if (typeof window === 'undefined') return 'voice'
  try {
    const stored = localStorage.getItem(INPUT_MODE_KEY)
    if (stored === 'text' || stored === 'voice') return stored
  } catch {
    /* noop */
  }
  return 'voice'
}

function readInitialVoice(): VoiceName {
  if (typeof window === 'undefined') return 'Aoede'
  try {
    const stored = localStorage.getItem(VOICE_KEY)
    if (stored && (VOICE_NAMES as readonly string[]).includes(stored)) {
      return stored as VoiceName
    }
  } catch {
    /* noop */
  }
  return 'Aoede'
}

function readInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const url = new URLSearchParams(window.location.search)
  const fromUrl = url.get('lang')
  if (fromUrl && LANGUAGES.includes(fromUrl as Language)) {
    try {
      localStorage.setItem(LANG_KEY, fromUrl)
    } catch {
      /* noop */
    }
    return fromUrl as Language
  }
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored && LANGUAGES.includes(stored as Language)) return stored as Language
  } catch {
    /* noop */
  }
  // Fall back to the browser's language preference, biased toward Spanish
  // when it leads with 'es-' (any LATAM / Spain variant), otherwise English.
  const nav = navigator?.language?.toLowerCase() ?? 'en'
  return nav.startsWith('es') ? 'es' : 'en'
}

function readInitialLite(): boolean {
  if (typeof window === 'undefined') return false
  const url = new URLSearchParams(window.location.search)
  if (url.has('lite')) {
    const v = url.get('lite') !== '0' && url.get('lite') !== 'false'
    try {
      localStorage.setItem(LITE_KEY, v ? '1' : '0')
    } catch {
      /* noop */
    }
    return v
  }
  try {
    return localStorage.getItem(LITE_KEY) === '1'
  } catch {
    return false
  }
}

export interface PhaseParams {
  noiseAmp: number
  noiseFreq: number
  noiseSpeed: number
  stretch: number
  iridescence: number
  streakIntensity: number
}

// Per-phase shader/animation parameters. react-spring lerps between these.
export const PHASE_PARAMS: Record<Phase, PhaseParams> = {
  idle: {
    noiseAmp: 0.18,
    noiseFreq: 1.2,
    noiseSpeed: 0.25,
    stretch: 1.0,
    iridescence: 0.05,
    streakIntensity: 0.15,
  },
  listening: {
    noiseAmp: 0.25,
    noiseFreq: 2.4,
    noiseSpeed: 0.6,
    stretch: 1.05,
    iridescence: 0.25,
    streakIntensity: 0.35,
  },
  thinking: {
    noiseAmp: 0.32,
    noiseFreq: 3.6,
    noiseSpeed: 1.6,
    stretch: 1.0,
    iridescence: 1.0,
    streakIntensity: 1.0,
  },
  asking: {
    noiseAmp: 0.22,
    noiseFreq: 1.8,
    noiseSpeed: 0.5,
    stretch: 1.45,
    iridescence: 0.55,
    streakIntensity: 0.45,
  },
  result: {
    noiseAmp: 0.04,
    noiseFreq: 0.8,
    noiseSpeed: 0.08,
    stretch: 1.0,
    iridescence: 0.4,
    streakIntensity: 0.18,
  },
}

export type Speaker = 'user' | 'lucy' | null

export type ConversationEventKind =
  | 'user_speech'
  | 'lucy_speech'
  | 'render'
  | 'update'
  | 'submit'
  | 'close'
  | 'search'
  | 'result'
  | 'note'

export interface ConversationEvent {
  id: string
  ts: number
  kind: ConversationEventKind
  title: string
  detail?: string
  data?: Record<string, unknown>
}

interface Store {
  phase: Phase
  micLevel: number
  micMuted: boolean
  voiceActive: boolean
  lite: boolean
  language: Language
  voiceName: VoiceName
  selectedMicId: string
  inputMode: InputMode
  // True while a TTS round-trip is in flight. Drives the text-input button
  // disabled state and a tiny spinner.
  textPending: boolean
  inputTranscript: string
  outputTranscript: string
  // Tracks who emitted the most recent transcription delta.
  lastSpeaker: Speaker
  chunksSent: number
  // A2UI surfaces — only the id is in zustand; the live SurfaceModel is held
  // by SurfacePanel via the processor's signals.
  activeSurfaceId: string | null
  surfaceIds: string[]
  iterationBySurface: Record<string, number>
  // True between Lucy's tool call and the surface mounting in the renderer.
  surfacePending: boolean
  events: ConversationEvent[]
  // Latest music search results — drives the ResultGallery.
  lastSearchResults: SearchResult[] | null
  lastSearchQuery: string | null
  searchPending: boolean
  // Browser-geolocation slot. In-memory only (no localStorage) per the
  // design call. `coords` carries the lat/lng + optional reverse-geocoded
  // label; `status` tracks the prompt lifecycle for the LocationToggle UI.
  userLocation: UserLocation | null
  userLocationStatus: UserLocationStatus

  setPhase(phase: Phase): void
  setMicLevel(level: number): void
  setMicMuted(muted: boolean): void
  setVoiceActive(active: boolean): void
  toggleLite(): void
  setLanguage(lang: Language): void
  toggleLanguage(): void
  setVoiceName(name: VoiceName): void
  setSelectedMicId(id: string): void
  setInputMode(mode: InputMode): void
  toggleInputMode(): void
  setTextPending(pending: boolean): void
  appendInputTranscript(delta: string): void
  appendOutputTranscript(delta: string): void
  resetTranscripts(): void
  bumpChunks(): void
  cyclePhase(): void
  registerSurface(id: string): void
  bumpSurfaceIteration(id: string): void
  unregisterSurface(id: string): void
  clearSurfaces(): void
  setSurfacePending(pending: boolean): void
  addEvent(event: Omit<ConversationEvent, 'id' | 'ts'>): void
  clearEvents(): void
  setSearchPending(pending: boolean): void
  setSearchResults(query: string | null, results: SearchResult[] | null): void
  clearSearchResults(): void
  setUserLocationStatus(status: UserLocationStatus): void
  setUserLocation(location: UserLocation | null, status?: UserLocationStatus): void
  clearUserLocation(): void
}

export const useStore = create<Store>((set, get) => ({
  phase: 'idle',
  micLevel: 0,
  micMuted: false,
  voiceActive: false,
  lite: readInitialLite(),
  toggleLite: () =>
    set((s) => {
      const next = !s.lite
      try {
        localStorage.setItem(LITE_KEY, next ? '1' : '0')
      } catch {
        /* noop */
      }
      return { lite: next }
    }),
  language: readInitialLanguage(),
  setLanguage: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* noop */
    }
    set({ language: lang })
  },
  toggleLanguage: () =>
    set((s) => {
      const next: Language = s.language === 'en' ? 'es' : 'en'
      try {
        localStorage.setItem(LANG_KEY, next)
      } catch {
        /* noop */
      }
      return { language: next }
    }),
  voiceName: readInitialVoice(),
  setVoiceName: (name) => {
    try {
      localStorage.setItem(VOICE_KEY, name)
    } catch {
      /* noop */
    }
    set({ voiceName: name })
  },
  selectedMicId: (() => {
    try {
      return localStorage.getItem(MIC_KEY) || 'default'
    } catch {
      return 'default'
    }
  })(),
  setSelectedMicId: (id) => {
    try {
      localStorage.setItem(MIC_KEY, id)
    } catch {
      /* noop */
    }
    set({ selectedMicId: id })
  },
  inputMode: readInitialInputMode(),
  textPending: false,
  setInputMode: (mode) => {
    try {
      localStorage.setItem(INPUT_MODE_KEY, mode)
    } catch {
      /* noop */
    }
    set({ inputMode: mode })
  },
  toggleInputMode: () =>
    set((s) => {
      const next: InputMode = s.inputMode === 'voice' ? 'text' : 'voice'
      try {
        localStorage.setItem(INPUT_MODE_KEY, next)
      } catch {
        /* noop */
      }
      return { inputMode: next }
    }),
  setTextPending: (pending) => set({ textPending: pending }),
  setPhase: (phase) => set({ phase }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setMicMuted: (micMuted) => set({ micMuted }),
  setVoiceActive: (voiceActive) => set({ voiceActive }),
  inputTranscript: '',
  outputTranscript: '',
  lastSpeaker: null,
  chunksSent: 0,
  appendInputTranscript: (delta) =>
    set((s) => {
      if (s.lastSpeaker !== 'user') {
        // New user turn — also clear Lucy's previous text so the top card
        // doesn't look like she's repeating herself. The sidebar keeps the
        // full history.
        return { lastSpeaker: 'user', inputTranscript: delta, outputTranscript: '' }
      }
      return { inputTranscript: (s.inputTranscript + delta).slice(-400) }
    }),
  appendOutputTranscript: (delta) =>
    set((s) => {
      if (s.lastSpeaker !== 'lucy') {
        return { lastSpeaker: 'lucy', outputTranscript: delta }
      }
      return { outputTranscript: (s.outputTranscript + delta).slice(-400) }
    }),
  resetTranscripts: () =>
    set({ inputTranscript: '', outputTranscript: '', chunksSent: 0, lastSpeaker: null }),
  bumpChunks: () => set((s) => ({ chunksSent: s.chunksSent + 1 })),
  cyclePhase: () => {
    const i = PHASES.indexOf(get().phase)
    set({ phase: PHASES[(i + 1) % PHASES.length] })
  },
  activeSurfaceId: null,
  surfaceIds: [],
  iterationBySurface: {},
  surfacePending: false,
  setSurfacePending: (pending) => set({ surfacePending: pending }),
  lastSearchResults: null,
  lastSearchQuery: null,
  searchPending: false,
  setSearchPending: (pending) => set({ searchPending: pending }),
  setSearchResults: (query, results) =>
    set((s) => {
      const next: Partial<Store> = {
        lastSearchQuery: query,
        lastSearchResults: results,
        searchPending: false,
      }
      // When the actual results land (not the pending null call) and the
      // user isn't actively in a surface, slide into 'result' phase so the
      // blob can morph into the top image.
      if (results && results.length > 0 && !s.activeSurfaceId) {
        next.phase = 'result'
      }
      return next
    }),
  clearSearchResults: () =>
    set((s) => ({
      lastSearchResults: null,
      lastSearchQuery: null,
      searchPending: false,
      phase: s.phase === 'result' ? 'listening' : s.phase,
    })),
  userLocation: null,
  userLocationStatus: 'idle',
  setUserLocationStatus: (status) => set({ userLocationStatus: status }),
  setUserLocation: (location, status) =>
    set({
      userLocation: location,
      userLocationStatus: status ?? (location ? 'granted' : 'idle'),
    }),
  clearUserLocation: () => set({ userLocation: null, userLocationStatus: 'idle' }),
  registerSurface: (id) =>
    set((s) => {
      if (s.surfaceIds.includes(id)) return {}
      return {
        surfaceIds: [...s.surfaceIds, id],
        activeSurfaceId: id,
        iterationBySurface: { ...s.iterationBySurface, [id]: 1 },
        phase: 'asking',
      }
    }),
  bumpSurfaceIteration: (id) =>
    set((s) => ({
      iterationBySurface: {
        ...s.iterationBySurface,
        [id]: (s.iterationBySurface[id] ?? 0) + 1,
      },
    })),
  unregisterSurface: (id) =>
    set((s) => {
      const remaining = s.surfaceIds.filter((x) => x !== id)
      const { [id]: _dropped, ...rest } = s.iterationBySurface
      return {
        surfaceIds: remaining,
        activeSurfaceId: remaining[remaining.length - 1] ?? null,
        iterationBySurface: rest,
        phase: remaining.length > 0 ? 'asking' : 'listening',
      }
    }),
  clearSurfaces: () => set({ surfaceIds: [], activeSurfaceId: null, iterationBySurface: {} }),
  events: [],
  addEvent: (event) =>
    set((s) => ({
      events: [
        ...s.events,
        {
          ...event,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
        },
      ].slice(-200),
    })),
  clearEvents: () => set({ events: [] }),
}))
