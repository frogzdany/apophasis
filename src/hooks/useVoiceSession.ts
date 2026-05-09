import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import type { FunctionCall } from '@google/genai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { APOPHASIS_CATALOG_ID, getProcessor, setActionListener } from '@/a2ui/processor'
import { AudioStreamer } from '@/audio/player'
import { AudioRecorder } from '@/audio/recorder'
import { getLiveCredential } from '@/gemini/credential'
import { LiveSession } from '@/gemini/liveSession'
import { t } from '@/lib/messages'
import { PROVIDERS_BY_NAME } from '@/lib/search/registry'
import { endLogSession, logEvent, startLogSession } from '@/lib/sessionLogger'
import { useStore } from '@/store'

interface ActionMeta {
  surfaceId: string
  fcId: string
  fcName: string
}

export function useVoiceSession() {
  const setPhase = useStore((s) => s.setPhase)
  const setMicLevel = useStore((s) => s.setMicLevel)
  const setVoiceActive = useStore((s) => s.setVoiceActive)
  const appendInputTranscript = useStore((s) => s.appendInputTranscript)
  const appendOutputTranscript = useStore((s) => s.appendOutputTranscript)
  const resetTranscripts = useStore((s) => s.resetTranscripts)
  const bumpChunks = useStore((s) => s.bumpChunks)
  const registerSurface = useStore((s) => s.registerSurface)
  const bumpSurfaceIteration = useStore((s) => s.bumpSurfaceIteration)
  const unregisterSurface = useStore((s) => s.unregisterSurface)
  const setSurfacePending = useStore((s) => s.setSurfacePending)
  const addEvent = useStore((s) => s.addEvent)
  const clearEvents = useStore((s) => s.clearEvents)
  const setSearchPending = useStore((s) => s.setSearchPending)
  const setSearchResults = useStore((s) => s.setSearchResults)
  const clearSearchResults = useStore((s) => s.clearSearchResults)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const sessionRef = useRef<LiveSession | null>(null)
  const playerRef = useRef<AudioStreamer | null>(null)
  const speakingRef = useRef(false)
  // Tracks the most recent toolCall id per surface so action submissions
  // route back to the right Gemini function call.
  const lastFcBySurface = useRef<Map<string, ActionMeta>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const cleanup = useCallback(() => {
    recorderRef.current?.stop()
    sessionRef.current?.close()
    playerRef.current?.close()
    setActionListener(null)
    recorderRef.current = null
    sessionRef.current = null
    playerRef.current = null
    speakingRef.current = false
    lastFcBySurface.current.clear()
    logEvent('session.stop')
    endLogSession()
    setVoiceActive(false)
    setMicLevel(0)
    setPhase('idle')
  }, [setPhase, setMicLevel, setVoiceActive])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  const start = useCallback(async () => {
    setError(null)

    const { language, voiceName } = useStore.getState()
    let apiKey: string
    try {
      // Tell the token endpoint which voice + language to lock into the
      // ephemeral token's liveConnectConstraints — otherwise Live API
      // ignores the client-supplied speechConfig.
      apiKey = await getLiveCredential({ voice: voiceName, language })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setError(`${t(language, 'controls.error.missingKey')} (${detail})`)
      return
    }

    try {
      const session = new LiveSession({ apiKey, language, voiceName })
      const recorder = new AudioRecorder()
      const player = new AudioStreamer()
      sessionRef.current = session
      recorderRef.current = recorder
      playerRef.current = player

      const processor = getProcessor()

      session.addEventListener('audio', (e) => {
        const detail = (e as CustomEvent<Int16Array>).detail
        if (!speakingRef.current) {
          speakingRef.current = true
          setPhase('thinking')
        }
        player.push(detail)
      })
      session.addEventListener('turnComplete', () => {
        const onIdle = () => {
          speakingRef.current = false
          // Drop back to listening if no surface is open. Surfaces keep the
          // phase at 'asking' through the convergence loop.
          const { activeSurfaceId } = useStore.getState()
          setPhase(activeSurfaceId ? 'asking' : 'listening')
          player.removeEventListener('idle', onIdle)
        }
        if (player.sources.size === 0) onIdle()
        else player.addEventListener('idle', onIdle)
      })
      session.addEventListener('interrupted', () => {
        player.stop()
        speakingRef.current = false
        const { activeSurfaceId } = useStore.getState()
        setPhase(activeSurfaceId ? 'asking' : 'listening')
      })
      // Buffer transcript fragments so we log one event per turn instead of
      // many tiny ones.
      let userBuf = ''
      let lucyBuf = ''
      let userTimer: ReturnType<typeof setTimeout> | null = null
      let lucyTimer: ReturnType<typeof setTimeout> | null = null
      const flushUser = () => {
        const text = userBuf.trim()
        userBuf = ''
        if (text) {
          addEvent({ kind: 'user_speech', title: text })
        }
      }
      const flushLucy = () => {
        const text = lucyBuf.trim()
        lucyBuf = ''
        if (text) {
          addEvent({ kind: 'lucy_speech', title: text })
        }
      }
      session.addEventListener('inputTranscript', (e) => {
        const d = (e as CustomEvent<string>).detail
        appendInputTranscript(d)
        userBuf += d
        if (userTimer) clearTimeout(userTimer)
        userTimer = setTimeout(flushUser, 800)
      })
      session.addEventListener('outputTranscript', (e) => {
        const d = (e as CustomEvent<string>).detail
        appendOutputTranscript(d)
        lucyBuf += d
        if (lucyTimer) clearTimeout(lucyTimer)
        lucyTimer = setTimeout(flushLucy, 800)
      })
      session.addEventListener('turnComplete', () => {
        if (userTimer) {
          clearTimeout(userTimer)
          userTimer = null
        }
        if (lucyTimer) {
          clearTimeout(lucyTimer)
          lucyTimer = null
        }
        flushUser()
        flushLucy()
      })
      session.addEventListener('error', (e) => {
        const detail = (e as CustomEvent).detail
        const msg =
          detail?.message ??
          detail?.reason ??
          (detail ? JSON.stringify(detail) : 'Live session error')
        setError(msg)
        cleanup()
      })
      session.addEventListener('close', () => cleanup())

      // Tool calls — translate into A2UI MessageProcessor messages.
      session.addEventListener('toolCall', (e) => {
        const fc = (e as CustomEvent<FunctionCall>).detail
        if (!fc?.name || !fc?.id) return
        // Flip to thinking the moment any toolCall fires (Lucy may emit one
        // BEFORE her first audio chunk; without this the blob/UI sit on
        // 'listening' until audio arrives).
        if (!speakingRef.current) {
          speakingRef.current = true
          setPhase('thinking')
        }
        const args = (fc.args ?? {}) as Record<string, unknown>
        const surfaceId = String(args.surface_id ?? '')

        try {
          if (fc.name === 'render_surface') {
            const components = args.components as unknown[]
            const dataModel = (args.data_model as Record<string, unknown>) ?? {}
            addEvent({
              kind: 'render',
              title: t(useStore.getState().language, 'event.render'),
              detail: surfaceId,
              data: dataModel,
            })
            // Searching new results: clear the gallery and signal that a
            // surface is being prepared so the UI can show a shimmer.
            clearSearchResults()
            setSurfacePending(true)
            // If a surface with this id already exists (Lucy retried), drop
            // it first so createSurface doesn't error out.
            try {
              processor.processMessages([
                { version: 'v0.9', deleteSurface: { surfaceId } },
              ] as unknown as A2uiMessage[])
            } catch {
              /* nothing to delete */
            }
            const messages = [
              {
                version: 'v0.9',
                createSurface: {
                  surfaceId,
                  catalogId: APOPHASIS_CATALOG_ID,
                  sendDataModel: true,
                },
              },
              { version: 'v0.9', updateComponents: { surfaceId, components } },
              { version: 'v0.9', updateDataModel: { surfaceId, path: '/', value: dataModel } },
            ] as unknown as A2uiMessage[]
            processor.processMessages(messages)
            registerSurface(surfaceId)
            setSurfacePending(false)
          } else if (fc.name === 'update_surface') {
            const components = args.components as unknown[] | undefined
            const dataModelPatch = (args.data_model_patch as Record<string, unknown>) ?? null
            const messages: unknown[] = []
            if (components) {
              messages.push({ version: 'v0.9', updateComponents: { surfaceId, components } })
            }
            if (dataModelPatch) {
              for (const [path, value] of Object.entries(dataModelPatch)) {
                messages.push({
                  version: 'v0.9',
                  updateDataModel: { surfaceId, path, value },
                })
              }
            }
            processor.processMessages(messages as unknown as A2uiMessage[])
            bumpSurfaceIteration(surfaceId)
            addEvent({
              kind: 'update',
              title: t(useStore.getState().language, 'event.update'),
              detail: surfaceId,
              data: dataModelPatch ?? undefined,
            })
          } else if (fc.name === 'close_surface') {
            const messages = [
              { version: 'v0.9', deleteSurface: { surfaceId } },
            ] as unknown as A2uiMessage[]
            processor.processMessages(messages)
            unregisterSurface(surfaceId)
            addEvent({
              kind: 'close',
              title: t(useStore.getState().language, 'event.close'),
              detail: surfaceId,
            })
          } else if (fc.name === 'respond_in_voice') {
            // No-op: the model handles the voice itself; we just ack so the
            // turn closes. Required because mode='ANY' forces a tool call
            // every turn, and chat-only turns route here.
            session.sendToolResponse([{ id: fc.id, name: fc.name, response: { ok: true } }])
            return
          } else if (PROVIDERS_BY_NAME[fc.name]) {
            // Generic search-provider dispatch. Any tool whose name matches
            // a registered provider runs through the same async path —
            // adding YouTube / Books / Web is one new file in providers/
            // plus an entry in the registry, no changes here.
            const provider = PROVIDERS_BY_NAME[fc.name]
            const lang = useStore.getState().language
            addEvent({
              kind: 'search',
              title: t(lang, 'event.search'),
              data: args as Record<string, unknown>,
            })
            const queryParts: string[] = []
            for (const v of Object.values(args)) {
              if (typeof v === 'string') queryParts.push(v)
              else if (Array.isArray(v))
                queryParts.push((v as unknown[]).filter((x) => typeof x === 'string').join(' '))
            }
            const queryLabel = queryParts.filter(Boolean).join(' · ')
            setSearchPending(true)
            setSearchResults(queryLabel || null, null)
            ;(async () => {
              try {
                const results = await provider.handler(args as Record<string, unknown>, 5)
                setSearchResults(queryLabel || null, results)
                const top = results[0]
                if (top) {
                  addEvent({
                    kind: 'result',
                    title: t(lang, 'event.result'),
                    detail: top.subtitle ? `${top.title} — ${top.subtitle}` : top.title,
                    data: {
                      ...top.facets,
                      ...(top.reason ? { reason: top.reason } : {}),
                    },
                  })
                } else {
                  addEvent({
                    kind: 'result',
                    title: t(lang, 'event.noMatches'),
                    detail: queryLabel || '',
                  })
                }
                session.sendToolResponse([
                  {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      results,
                      count: results.length,
                      kind: provider.kind,
                      summary: results.length
                        ? `${results.length} matches. Top: ${top?.title}` +
                          (top?.subtitle ? ` (${top.subtitle})` : '') +
                          '.'
                        : 'No matches for this query.',
                    },
                  },
                ])
              } catch (err) {
                console.error('[lucy] provider threw', fc.name, err)
                setSearchPending(false)
                session.sendToolResponse([
                  {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      results: [],
                      count: 0,
                      error: err instanceof Error ? err.message : String(err),
                    },
                  },
                ])
              }
            })()
            return
          }

          // Remember which fc owns this surface so action submissions can
          // route their FunctionResponse back to the right call.
          lastFcBySurface.current.set(surfaceId, {
            surfaceId,
            fcId: fc.id,
            fcName: fc.name,
          })

          // Acknowledge the tool call so Gemini progresses its turn.
          session.sendToolResponse([
            {
              id: fc.id,
              name: fc.name,
              response: { ok: true, surface_id: surfaceId },
            },
          ])
        } catch (err) {
          console.error('[lucy] toolCall handler failed', err)
          session.sendToolResponse([
            {
              id: fc.id,
              name: fc.name,
              response: {
                error: {
                  code: 'INVALID_PAYLOAD',
                  message: err instanceof Error ? err.message : String(err),
                },
              },
            },
          ])
        }
      })

      // A2UI surface actions — when the user clicks a Button or otherwise
      // dispatches an action, push the dataModel back to Lucy as a fresh
      // user turn (the original toolCall was already acked, so we can't
      // reuse its fcId).
      setActionListener(async (action) => {
        const { activeSurfaceId, language } = useStore.getState()
        if (!activeSurfaceId) return

        const surface = processor.model.getSurface(activeSurfaceId)
        const dataModel = surface?.dataModel.get('/') as Record<string, unknown> | undefined

        addEvent({
          kind: 'submit',
          title: t(language, 'event.submit'),
          detail: activeSurfaceId,
          data: dataModel,
        })

        const eventName = (action as { name?: string } | null | undefined)?.name ?? 'submit'
        logEvent('surface.submit', {
          surfaceId: activeSurfaceId,
          eventName,
          dataModel,
        })
        const userText = [
          `[surface_event] surface_id=${activeSurfaceId}`,
          `event=${eventName}`,
          `data_model=${JSON.stringify(dataModel ?? {})}`,
          'Decide whether to refine with a fresh update_surface, call ' +
            'search_music if you have enough info, or respond_in_voice for a ' +
            'brief acknowledgement.',
        ].join('\n')
        session.sendUserText(userText)

        // Drop the just-submitted surface so the next render lands clean.
        try {
          processor.processMessages([
            { version: 'v0.9', deleteSurface: { surfaceId: activeSurfaceId } },
          ] as unknown as A2uiMessage[])
        } catch (err) {
          console.warn('[lucy] deleteSurface after submit failed', err)
        }
        unregisterSurface(activeSurfaceId)
      })

      recorder.addEventListener('chunk', (e) => {
        // Always forward mic audio — even while Lucy is speaking. Echo
        // cancellation on the input prevents her own voice from leaking
        // back, and Gemini Live's server VAD detects the user's voice and
        // fires `interrupted` so the player drops what's queued.
        session.sendAudioChunk((e as CustomEvent<ArrayBuffer>).detail)
        bumpChunks()
      })
      recorder.addEventListener('level', (e) => {
        setMicLevel((e as CustomEvent<number>).detail)
      })

      resetTranscripts()
      clearEvents()
      const sid = startLogSession()
      logEvent('session.start', { language, voiceName, sid })
      await session.connect()
      await player.resume()
      await recorder.start({ deviceId: useStore.getState().selectedMicId })

      setVoiceActive(true)
      setPhase('listening')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      cleanup()
    }
  }, [
    cleanup,
    setMicLevel,
    setPhase,
    setVoiceActive,
    appendInputTranscript,
    appendOutputTranscript,
    resetTranscripts,
    bumpChunks,
    registerSurface,
    bumpSurfaceIteration,
    unregisterSurface,
    setSurfacePending,
    addEvent,
    clearEvents,
    setSearchPending,
    setSearchResults,
    clearSearchResults,
  ])

  useEffect(() => () => cleanup(), [cleanup])

  return { start, stop, error }
}
