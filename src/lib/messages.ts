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
    'controls.mute': 'Mute mic',
    'controls.unmute': 'Unmute mic',
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
    'location.share': 'Share location',
    'location.requesting': 'Locating…',
    'location.granted': 'Location on',
    'location.denied': 'Permission denied',
    'location.unavailable': 'Location unavailable',
    'location.timeout': 'Location timed out',
    'location.unsupported': 'Location not supported',
    'location.tooltip':
      'Share your browser location so Lucy can prefer "near me" results from Google Places. Stays in this tab — never persisted.',
    'location.infoTitle': 'How location is used',
    'location.infoBody':
      "When you share your location, Lucy receives the coordinates only for this session. They're used to bias place searches toward where you are. Coordinates are not stored anywhere; close the tab and they're gone.",
    'location.clear': 'Clear location',
    'location.retry': 'Try again',
    'visitor.badge': 'AI Tinkerers · Hackathon Demo',
    'visitor.title': 'Welcome to Apophasis',
    'visitor.subtitle':
      "Lucy is a voice-driven reverse search engine for things you can't quite name — a song stuck in your head, a place a friend mentioned once, a book you only remember by its cover.",
    'visitor.context':
      'Built for the AI Tinkerers Vibe Coding hackathon at Google Polanco. Tell us a bit about yourself before we hand the mic over to Lucy — it lets us cap demo abuse and stay in touch after the event.',
    'visitor.field.name': 'Name',
    'visitor.field.namePlaceholder': 'Your full name',
    'visitor.field.email': 'Email',
    'visitor.field.emailPlaceholder': 'you@example.com',
    'visitor.field.linkedin': 'LinkedIn (optional)',
    'visitor.field.linkedinPlaceholder': 'linkedin.com/in/your-handle',
    'visitor.submit': 'Start',
    'visitor.submitting': 'Verifying…',
    'visitor.fineprint':
      "We don't share your details. reCAPTCHA v3 protects this form against abuse.",
    'visitor.error.name_required': 'Please add your name.',
    'visitor.error.name_too_long': 'That name is unusually long — please shorten it.',
    'visitor.error.email_required': 'Please add an email so we can follow up.',
    'visitor.error.email_too_long': 'That email is too long — please double-check it.',
    'visitor.error.email_invalid': 'That email doesn\'t look right.',
    'visitor.error.linkedin_too_long': 'That LinkedIn URL is too long — please trim it.',
    'visitor.error.linkedin_invalid': "That LinkedIn URL doesn't parse — leave it blank if unsure.",
    'visitor.error.linkedin_not_linkedin': 'Please use a linkedin.com URL or leave the field blank.',
    'visitor.error.recaptcha_missing': 'reCAPTCHA token missing — try the Start button again.',
    'visitor.error.recaptcha_failed': 'reCAPTCHA failed to verify your request — please try again.',
    'visitor.error.recaptcha_low_score':
      "We couldn't confidently verify you weren't a bot. Please try again from a regular browser.",
    'visitor.error.recaptcha_action_mismatch': 'reCAPTCHA action mismatch — try the Start button again.',
    'visitor.error.rate_limited': 'Too many attempts — please wait a minute and try again.',
    'visitor.error.persistence_failed': "We couldn't save your info — please try again.",
    'visitor.error.network': 'Network error — please check your connection and try again.',
    'visitor.error.recaptcha_unconfigured':
      "reCAPTCHA is not configured for this build. Skipping this gate — you can continue.",
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
    'gallery.open': 'Open link',
    'gallery.open.music': 'Open in Apple Music',
    'gallery.open.video': 'Open on YouTube',
    'gallery.open.book': 'Open in Google Books',
    'gallery.open.place': 'Open in Google Maps',
    'gallery.open.product': 'View product',
    'gallery.open.movie': 'Open link',
    'gallery.open.web': 'Open link',
    'gallery.open.other': 'Open link',
    'surface.preparing': 'Lucy is preparing a panel…',

    'app.title': 'Apophasis',
    'app.tagline': 'Reverse search via generative UI',

    'tour.welcome':
      "Welcome to Apophasis — a reverse search engine for things you can't quite describe.",
    'tour.welcome.q1': '"That song that goes da da da dum… it was in a movie…"',
    'tour.welcome.q2': '"A book about a guy stuck on Mars, I think it was funny"',
    'tour.welcome.q3': '"A restaurant with the blue sign near the park, they had amazing tacos"',
    'tour.welcome.cta':
      "Talk to Lucy, describe what you're looking for in your own words, and she'll take care of the rest.",
    'tour.howItWorks':
      'When you talk, Lucy will create interactive panels to refine your search and results will appear in a gallery. Music, videos, books, places and more.',
    'tour.lucy':
      'This is Lucy, your AI voice agent. The blob changes shape based on what Lucy is doing: listening, thinking or showing results.',
    'tour.controls': 'This is your control bar. Everything you need to interact with Lucy is here.',
    'tour.talkButton':
      "Tap this button and start describing what you're looking for. A song you half-remember, a place from a story, a product you saw once — just speak naturally.",
    'tour.voiceSelector': 'Choose the voice Lucy uses when she responds.',
    'tour.micSelector': 'Select which microphone to use if you have more than one.',
    'tour.langToggle': 'Switch between English and Spanish — Lucy speaks both.',
    'tour.liteToggle':
      'Turn on lite mode to reduce visual effects on slower devices. You can also press L on your keyboard.',
    'tour.closing':
      "That's it! Try describing something you vaguely remember — a song, a place, a book — and let Lucy find it for you.",

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
    'controls.mute': 'Mutear micrófono',
    'controls.unmute': 'Activar micrófono',
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
    'location.share': 'Compartir ubicación',
    'location.requesting': 'Localizando…',
    'location.granted': 'Ubicación activa',
    'location.denied': 'Permiso denegado',
    'location.unavailable': 'Ubicación no disponible',
    'location.timeout': 'Tiempo agotado',
    'location.unsupported': 'No soportado',
    'location.tooltip':
      'Comparte tu ubicación del navegador para que Lucy priorice resultados "cerca de mí" de Google Places. Solo se usa en esta pestaña; nunca se guarda.',
    'location.infoTitle': 'Cómo se usa tu ubicación',
    'location.infoBody':
      'Cuando compartes tu ubicación, Lucy recibe las coordenadas solo para esta sesión. Se usan para sesgar las búsquedas de lugares hacia donde estás. No se guardan en ningún lado; al cerrar la pestaña, desaparecen.',
    'location.clear': 'Quitar ubicación',
    'location.retry': 'Reintentar',
    'visitor.badge': 'AI Tinkerers · Demo del Hackathon',
    'visitor.title': 'Bienvenida a Apophasis',
    'visitor.subtitle':
      'Lucy es un buscador inverso por voz para cosas que no puedes nombrar: una canción atorada en la cabeza, un lugar que alguien te describió una vez, un libro que sólo recuerdas por la portada.',
    'visitor.context':
      'Construido para el Hackathon de Vibe Coding de AI Tinkerers en Google Polanco. Cuéntanos un poco de ti antes de pasarle el micrófono a Lucy — así controlamos el abuso del demo y nos mantenemos en contacto después del evento.',
    'visitor.field.name': 'Nombre',
    'visitor.field.namePlaceholder': 'Tu nombre completo',
    'visitor.field.email': 'Correo',
    'visitor.field.emailPlaceholder': 'tu@ejemplo.com',
    'visitor.field.linkedin': 'LinkedIn (opcional)',
    'visitor.field.linkedinPlaceholder': 'linkedin.com/in/tu-usuario',
    'visitor.submit': 'Comenzar',
    'visitor.submitting': 'Verificando…',
    'visitor.fineprint':
      'No compartimos tus datos. reCAPTCHA v3 protege este formulario contra abuso.',
    'visitor.error.name_required': 'Por favor escribe tu nombre.',
    'visitor.error.name_too_long': 'Ese nombre es inusualmente largo — acórtalo por favor.',
    'visitor.error.email_required': 'Necesitamos un correo para mantenernos en contacto.',
    'visitor.error.email_too_long': 'Ese correo es muy largo — verifícalo por favor.',
    'visitor.error.email_invalid': 'Ese correo no parece correcto.',
    'visitor.error.linkedin_too_long': 'Esa URL de LinkedIn es muy larga — recórtala por favor.',
    'visitor.error.linkedin_invalid': 'Esa URL de LinkedIn no se entiende — déjala en blanco si dudas.',
    'visitor.error.linkedin_not_linkedin': 'Usa una URL de linkedin.com o deja el campo vacío.',
    'visitor.error.recaptcha_missing': 'Falta el token de reCAPTCHA — intenta de nuevo con Comenzar.',
    'visitor.error.recaptcha_failed': 'reCAPTCHA no pudo verificar tu solicitud — intenta de nuevo.',
    'visitor.error.recaptcha_low_score':
      'No pudimos verificar con confianza que no eres un bot. Intenta desde un navegador normal.',
    'visitor.error.recaptcha_action_mismatch':
      'Acción de reCAPTCHA no coincide — intenta de nuevo con Comenzar.',
    'visitor.error.rate_limited':
      'Demasiados intentos — espera un minuto e intenta de nuevo.',
    'visitor.error.persistence_failed': 'No pudimos guardar tus datos — intenta de nuevo.',
    'visitor.error.network': 'Error de red — verifica tu conexión e intenta de nuevo.',
    'visitor.error.recaptcha_unconfigured':
      'reCAPTCHA no está configurado en esta build. Saltando esta validación — puedes continuar.',
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
    'gallery.open': 'Abrir enlace',
    'gallery.open.music': 'Abrir en Apple Music',
    'gallery.open.video': 'Ver en YouTube',
    'gallery.open.book': 'Abrir en Google Books',
    'gallery.open.place': 'Abrir en Google Maps',
    'gallery.open.product': 'Ver producto',
    'gallery.open.movie': 'Abrir enlace',
    'gallery.open.web': 'Abrir enlace',
    'gallery.open.other': 'Abrir enlace',
    'surface.preparing': 'Lucy está preparando un panel…',

    'app.title': 'Apophasis',
    'app.tagline': 'Búsqueda inversa con UI generativa',

    'tour.welcome':
      'Bienvenido a Apophasis — un buscador inverso para cosas que no sabes cómo describir.',
    'tour.welcome.q1': '"Esa canción que va da da da dum… salía en una peli…"',
    'tour.welcome.q2': '"Un libro de un tipo atrapado en Marte, creo que era gracioso"',
    'tour.welcome.q3':
      '"Un restaurante con el letrero azul cerca del parque, tenían unos tacos increíbles"',
    'tour.welcome.cta':
      'Habla con Lucy, descríbele lo que buscas con tus propias palabras, y ella se encarga del resto.',
    'tour.howItWorks':
      'Cuando hables, Lucy creará paneles interactivos para afinar tu búsqueda y los resultados aparecerán en una galería. Música, videos, libros, lugares y más.',
    'tour.lucy':
      'Esta es Lucy, tu agente de voz con IA. El blob cambia de forma según lo que Lucy hace: escuchar, pensar o mostrar resultados.',
    'tour.controls':
      'Esta es tu barra de control. Todo lo que necesitas para interactuar con Lucy está aquí.',
    'tour.talkButton':
      'Toca este botón y empieza a describir lo que buscas. Una canción que medio recuerdas, un lugar de una historia, un producto que viste una vez — solo habla naturalmente.',
    'tour.voiceSelector': 'Elige la voz que usa Lucy cuando te responde.',
    'tour.micSelector': 'Selecciona qué micrófono usar si tienes más de uno.',
    'tour.langToggle': 'Cambia entre inglés y español — Lucy habla ambos idiomas.',
    'tour.liteToggle':
      'Activa el modo ligero para reducir efectos visuales en dispositivos lentos. También puedes presionar L en tu teclado.',
    'tour.closing':
      '¡Eso es todo! Prueba a describir algo que recuerdes vagamente — una canción, un lugar, un libro — y deja que Lucy lo encuentre por ti.',

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
