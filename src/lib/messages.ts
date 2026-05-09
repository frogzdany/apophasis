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

    'tour.welcome': 'Welcome to Apophasis — a reverse search engine for things you can\'t quite describe.',
    'tour.welcome.q1': '"That song that goes da da da dum… it was in a movie…"',
    'tour.welcome.q2': '"A book about a guy stuck on Mars, I think it was funny"',
    'tour.welcome.q3': '"A restaurant with the blue sign near the park, they had amazing tacos"',
    'tour.welcome.cta': 'Talk to Lucy, describe what you\'re looking for in your own words, and she\'ll take care of the rest.',
    'tour.howItWorks': 'When you talk, Lucy will create interactive panels to refine your search and results will appear in a gallery. Music, videos, books, places and more.',
    'tour.lucy': 'This is Lucy, your AI voice agent. The blob changes shape based on what Lucy is doing: listening, thinking or showing results.',
    'tour.controls': 'This is your control bar. Everything you need to interact with Lucy is here.',
    'tour.talkButton': 'Tap this button and start describing what you\'re looking for. A song you half-remember, a place from a story, a product you saw once — just speak naturally.',
    'tour.voiceSelector': 'Choose the voice Lucy uses when she responds.',
    'tour.micSelector': 'Select which microphone to use if you have more than one.',
    'tour.langToggle': 'Switch between English and Spanish — Lucy speaks both.',
    'tour.liteToggle': 'Turn on lite mode to reduce visual effects on slower devices. You can also press L on your keyboard.',
    'tour.closing': 'That\'s it! Try describing something you vaguely remember — a song, a place, a book — and let Lucy find it for you.',

    'tour.btn.back': 'Back',
    'tour.btn.close': 'Close',
    'tour.btn.last': 'Done!',
    'tour.btn.next': 'Next',
    'tour.btn.nextProgress': 'Next ({current} of {total})', // {current}/{total} are interpolated by Joyride, not t()
    'tour.btn.open': 'Open',
    'tour.btn.skip': 'Skip tour',
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

    'tour.welcome': 'Bienvenido a Apophasis — un buscador inverso para cosas que no sabes cómo describir.',
    'tour.welcome.q1': '"Esa canción que va da da da dum… salía en una peli…"',
    'tour.welcome.q2': '"Un libro de un tipo atrapado en Marte, creo que era gracioso"',
    'tour.welcome.q3': '"Un restaurante con el letrero azul cerca del parque, tenían unos tacos increíbles"',
    'tour.welcome.cta': 'Habla con Lucy, descríbele lo que buscas con tus propias palabras, y ella se encarga del resto.',
    'tour.howItWorks': 'Cuando hables, Lucy creará paneles interactivos para afinar tu búsqueda y los resultados aparecerán en una galería. Música, videos, libros, lugares y más.',
    'tour.lucy': 'Esta es Lucy, tu agente de voz con IA. El blob cambia de forma según lo que Lucy hace: escuchar, pensar o mostrar resultados.',
    'tour.controls': 'Esta es tu barra de control. Todo lo que necesitas para interactuar con Lucy está aquí.',
    'tour.talkButton': 'Toca este botón y empieza a describir lo que buscas. Una canción que medio recuerdas, un lugar de una historia, un producto que viste una vez — solo habla naturalmente.',
    'tour.voiceSelector': 'Elige la voz que usa Lucy cuando te responde.',
    'tour.micSelector': 'Selecciona qué micrófono usar si tienes más de uno.',
    'tour.langToggle': 'Cambia entre inglés y español — Lucy habla ambos idiomas.',
    'tour.liteToggle': 'Activa el modo ligero para reducir efectos visuales en dispositivos lentos. También puedes presionar L en tu teclado.',
    'tour.closing': '¡Eso es todo! Prueba a describir algo que recuerdes vagamente — una canción, un lugar, un libro — y deja que Lucy lo encuentre por ti.',

    'tour.btn.back': 'Atrás',
    'tour.btn.close': 'Cerrar',
    'tour.btn.last': '¡Listo!',
    'tour.btn.next': 'Siguiente',
    'tour.btn.nextProgress': 'Siguiente ({current} de {total})', // {current}/{total} are interpolated by Joyride, not t()
    'tour.btn.open': 'Abrir',
    'tour.btn.skip': 'Saltar tour',
  },
}

export function t(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const raw = MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`))
}
