// Tiny i18n layer. Keys are flat dotted strings; values may contain {var}
// placeholders that t() interpolates. Adding a language = new entry below
// + nothing else.
export type Language = 'en' | 'es'

export const LANGUAGES: Language[] = ['en', 'es']

export const LANGUAGE_LABEL: Record<Language, string> = {
  en: 'EN',
  es: 'ES',
}

const MESSAGES: Record<Language, Record<string, string>> = {
  en: {
    'phase.idle': 'IDLE',
    'phase.listening': 'LISTENING',
    'phase.thinking': 'THINKING',
    'phase.asking': 'ASKING',
    'phase.result': 'RESULT',

    'controls.talk': 'Talk to Lucy',
    'controls.stop': 'Stop talking',
    'controls.next': 'Next state',
    'controls.inputMode.voice': 'Voice',
    'controls.inputMode.text': 'Text',
    'controls.inputMode.tooltip': 'Switch input mode (mic ↔ typed via TTS)',
    'controls.lite': 'Lite',
    'controls.liteOn': 'Lite ✓',
    'controls.liteTooltip': 'Toggle lite mode (L)',
    'controls.langTooltip': 'Toggle language',
    'controls.test': 'Test',
    'controls.testTooltip': 'Render a sample A2UI surface (no LLM)',
    'controls.error.missingKey': 'Missing VITE_GEMINI_API_KEY in .env.local',
    'preset.basic': 'Basic form',
    'preset.music': 'Music search',
    'preset.gallery': 'All primitives',
    'preset.mood': 'Mood + chips',

    'transcript.you': 'you',
    'transcript.lucy': 'lucy',
    'transcript.meta': 'chunks sent: {n} · mic rms: {rms}',

    'mic.default': 'Default mic',
    'mic.title': 'Microphone',
    'mic.placeholder': 'Select mic',
    'mic.unnamed': 'Mic ({id})',
    'voice.title': 'Lucy voice',

    'surface.iter': 'surface · {id} · iter {n}',
    'surface.close': 'Close surface',
    'surface.send': 'Send',
    'surface.sendManual': 'Force submit (fallback)',

    'sidebar.title': 'Conversation',
    'sidebar.clear': 'Clear log',
    'sidebar.empty': 'Lucy will log her decisions here as you talk.',
    'sidebar.textPlaceholder': 'Type to Lucy (TTS → live)…',
    'sidebar.textSend': 'Send',
    'sidebar.textHint': 'Text is synthesised and replayed as voice.',
    'event.user_speech': 'You said',
    'event.lucy_speech': 'Lucy said',
    'event.render': 'Lucy rendered a panel',
    'event.update': 'Lucy refined the panel',
    'event.submit': 'You submitted',
    'event.close': 'Surface closed',
    'event.search': 'Searching',
    'event.result': 'Result',
    'event.noMatches': 'No matches',
    'gallery.title': 'Results',
    'gallery.empty': 'No results found for this query.',
    'gallery.pending': 'Searching iTunes…',
    'gallery.dismiss': 'Close results',
    'gallery.preview': 'Preview',
    'gallery.open': 'Open in Apple Music',
    'surface.preparing': 'Lucy is preparing a panel…',

    'app.title': 'Apophasis',
    'app.tagline': 'Reverse search via generative UI',
  },
  es: {
    'phase.idle': 'INACTIVA',
    'phase.listening': 'ESCUCHANDO',
    'phase.thinking': 'PENSANDO',
    'phase.asking': 'PREGUNTANDO',
    'phase.result': 'RESULTADO',

    'controls.talk': 'Hablar con Lucy',
    'controls.stop': 'Detener',
    'controls.next': 'Siguiente estado',
    'controls.inputMode.voice': 'Voz',
    'controls.inputMode.text': 'Texto',
    'controls.inputMode.tooltip': 'Alternar entrada (mic ↔ texto por TTS)',
    'controls.lite': 'Lite',
    'controls.liteOn': 'Lite ✓',
    'controls.liteTooltip': 'Modo ligero (L)',
    'controls.langTooltip': 'Cambiar idioma',
    'controls.test': 'Test',
    'controls.testTooltip': 'Renderiza un panel A2UI de prueba (sin LLM)',
    'controls.error.missingKey': 'Falta VITE_GEMINI_API_KEY en .env.local',
    'preset.basic': 'Formulario básico',
    'preset.music': 'Búsqueda de música',
    'preset.gallery': 'Todos los primitivos',
    'preset.mood': 'Onda + etiquetas',

    'transcript.you': 'tú',
    'transcript.lucy': 'lucy',
    'transcript.meta': 'fragmentos enviados: {n} · mic rms: {rms}',

    'mic.default': 'Micrófono predeterminado',
    'mic.title': 'Micrófono',
    'mic.placeholder': 'Elige micrófono',
    'mic.unnamed': 'Mic ({id})',
    'voice.title': 'Voz de Lucy',

    'surface.iter': 'panel · {id} · iter {n}',
    'surface.close': 'Cerrar panel',
    'surface.send': 'Enviar',
    'surface.sendManual': 'Forzar envío (respaldo)',

    'sidebar.title': 'Conversación',
    'sidebar.clear': 'Limpiar registro',
    'sidebar.empty': 'Lucy registra aquí sus decisiones mientras hablan.',
    'sidebar.textPlaceholder': 'Escríbele a Lucy (TTS → en vivo)…',
    'sidebar.textSend': 'Enviar',
    'sidebar.textHint': 'El texto se sintetiza y se manda como voz.',
    'event.user_speech': 'Tú dijiste',
    'event.lucy_speech': 'Lucy dijo',
    'event.render': 'Lucy abrió un panel',
    'event.update': 'Lucy refinó el panel',
    'event.submit': 'Enviaste',
    'event.close': 'Panel cerrado',
    'event.search': 'Buscando',
    'event.result': 'Resultado',
    'event.noMatches': 'Sin coincidencias',
    'gallery.title': 'Resultados',
    'gallery.empty': 'No se encontraron resultados para esta búsqueda.',
    'gallery.pending': 'Buscando en iTunes…',
    'gallery.dismiss': 'Cerrar resultados',
    'gallery.preview': 'Escuchar',
    'gallery.open': 'Abrir en Apple Music',
    'surface.preparing': 'Lucy está preparando un panel…',

    'app.title': 'Apophasis',
    'app.tagline': 'Búsqueda inversa con UI generativa',
  },
}

export function t(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const raw = MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`))
}
