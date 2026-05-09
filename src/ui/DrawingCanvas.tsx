import { Book, Eraser, Globe, Loader2, MapPin, Music, Pen, PenLine, Search, ShoppingBag, Sparkles, Trash2, Video, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchDrawingSurface } from '@/a2ui/drawingSurface'
import type { DrawingSurface } from '@/a2ui/drawingSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/useT'
import { useStore } from '@/store'

const COLORS = ['#ffffff', '#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#e879f9']
const BRUSH_SIZES = [3, 6, 12, 20]
const CANVAS_W = 900
const CANVAS_H = 480
const BG = '#06070a'

type DrawingTool = 'pen' | 'eraser'
type PanelState = 'drawing' | 'interpreting' | 'result'

type Domain = 'music' | 'video' | 'book' | 'place' | 'product' | 'web'

const DOMAIN_META: Record<Domain, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  music:   { icon: Music,       label: 'Music',    color: 'text-pink-400' },
  video:   { icon: Video,       label: 'Video',    color: 'text-red-400' },
  book:    { icon: Book,        label: 'Books',    color: 'text-amber-400' },
  place:   { icon: MapPin,      label: 'Places',   color: 'text-emerald-400' },
  product: { icon: ShoppingBag, label: 'Products', color: 'text-blue-400' },
  web:     { icon: Globe,       label: 'Web',      color: 'text-sky-400' },
}

function getCanvasPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  if ('touches' in e) {
    const t = e.touches[0]
    return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
  }
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

export function DrawingCanvas() {
  const drawingOpen      = useStore((s) => s.drawingOpen)
  const drawingPrompt    = useStore((s) => s.drawingPrompt)
  const setDrawingOpen   = useStore((s) => s.setDrawingOpen)
  const setDrawingInterp = useStore((s) => s.setDrawingInterpretation)
  const addEvent         = useStore((s) => s.addEvent)
  const { t } = useT()

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef   = useRef<{ x: number; y: number } | null>(null)

  const [panelState, setPanelState] = useState<PanelState>('drawing')
  const [color,      setColor]      = useState('#ffffff')
  const [brushSize,  setBrushSize]  = useState(6)
  const [tool,       setTool]       = useState<DrawingTool>('pen')
  const [error,      setError]      = useState<string | null>(null)
  const [result, setResult] = useState<{
    description: string; domain: string; searchQuery: string
    title: string; attributes: Record<string, string | number>
  } | null>(null)
  // 'idle' | 'generating' | 'ready' — tracks the background surface gen call
  const [surfaceState, setSurfaceState] = useState<'idle' | 'generating' | 'ready'>('idle')
  const pendingSurfaceRef = useRef<DrawingSurface | null>(null)

  // Reset state when panel opens
  useEffect(() => {
    if (!drawingOpen) {
      setPanelState('drawing')
      setResult(null)
      setError(null)
      setSurfaceState('idle')
      pendingSurfaceRef.current = null
      return
    }
    // Fill canvas background on open
    requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    })
  }, [drawingOpen])

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getCanvasPos(e, canvas)
    lastPosRef.current = pos
    isDrawingRef.current = true
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, (tool === 'eraser' ? brushSize * 2 : brushSize) / 2, 0, Math.PI * 2)
    ctx.fillStyle = tool === 'eraser' ? BG : color
    ctx.fill()
  }, [color, brushSize, tool])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getCanvasPos(e, canvas)
    if (!lastPosRef.current) { lastPosRef.current = pos; return }
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = tool === 'eraser' ? BG : color
    ctx.lineWidth   = tool === 'eraser' ? brushSize * 2 : brushSize
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.stroke()
    lastPosRef.current = pos
  }, [color, brushSize, tool])

  const stopDraw = useCallback(() => {
    isDrawingRef.current = false
    lastPosRef.current = null
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const handleClose = useCallback(() => {
    setDrawingInterp(null)
    setDrawingOpen(false)
  }, [setDrawingOpen, setDrawingInterp])

  const interpret = useCallback(async () => {
    const canvas = canvasRef.current; if (!canvas) return
    setPanelState('interpreting')
    setError(null)
    try {
      const imageBase64 = canvas.toDataURL('image/png').split(',')[1]
      const res  = await fetch('/api/interpret-drawing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      const data = await res.json() as {
        description?: string; domain?: string; searchQuery?: string
        title?: string; attributes?: Record<string, string | number>; error?: string
      }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Interpretation failed')

      const interp = {
        description: data.description ?? '',
        domain:      data.domain      ?? 'web',
        searchQuery: data.searchQuery ?? data.description ?? '',
        title:       data.title       ?? 'Drawing',
        attributes:  data.attributes  ?? {},
      }
      setResult(interp)
      setDrawingInterp(interp)
      addEvent({ kind: 'note', title: t('event.drawingResult'), detail: interp.description })

      // Send visual context to Lucy's live session
      const lucyText = [
        '[drawing_context]',
        `The user drew: ${interp.description}`,
        `Suggested search: domain=${interp.domain}, query="${interp.searchQuery}"`,
        'Use this context — call the matching search_* tool or render_surface immediately.',
      ].join('\n')
      window.dispatchEvent(new CustomEvent('lucyDrawingContext', { detail: lucyText }))

      setPanelState('result')

      // Fire generative UI in the background — doesn't block the result card.
      setSurfaceState('generating')
      fetch('/api/generate-surface', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interpretation: interp }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
        .then((surface: DrawingSurface) => {
          pendingSurfaceRef.current = surface
          setSurfaceState('ready')
        })
        .catch((e) => {
          console.warn('[drawing] surface generation failed', e)
          setSurfaceState('idle')
        })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error interpreting drawing')
      setPanelState('drawing')
    }
  }, [setDrawingInterp, addEvent, t])

  const handleSearch = useCallback((query: string) => {
    addEvent({ kind: 'note', title: 'Searching from drawing', detail: query })
    window.dispatchEvent(new CustomEvent('lucyDrawingContext', { detail: query }))
    handleClose()
  }, [addEvent, handleClose])

  if (!drawingOpen) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md">
      <div className="flex max-h-[95vh] w-[92vw] max-w-3xl flex-col gap-3 rounded-2xl border border-white/10 bg-[#0d0e12] p-4 shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-lg text-white">
              {panelState === 'result' ? t('drawing.interpreted') : t('drawing.title')}
            </h2>
            {drawingPrompt && panelState !== 'result' && (
              <p className="mt-0.5 text-sm text-white/50">{drawingPrompt}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* ── Result view (replaces canvas) ── */}
        {panelState === 'result' && result ? (
          <ResultView
            result={result}
            surfaceState={surfaceState}
            pendingSurface={pendingSurfaceRef.current}
            onSearch={handleSearch}
            onOpenSurface={() => {
              if (pendingSurfaceRef.current) {
                dispatchDrawingSurface(pendingSurfaceRef.current)
              }
              handleClose()
            }}
            onDrawAgain={() => {
              setPanelState('drawing')
              setResult(null)
              setDrawingInterp(null)
              setSurfaceState('idle')
              pendingSurfaceRef.current = null
              requestAnimationFrame(() => {
                const canvas = canvasRef.current; if (!canvas) return
                const ctx = canvas.getContext('2d'); if (!ctx) return
                ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height)
              })
            }}
          />
        ) : (
          <>
            {/* ── Canvas ── */}
            <div className="relative flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#06070a]">
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="block h-full w-full cursor-crosshair touch-none select-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={(e) => { e.preventDefault(); startDraw(e) }}
                onTouchMove={(e)  => { e.preventDefault(); draw(e) }}
                onTouchEnd={stopDraw}
              />
              {panelState === 'interpreting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <p className="animate-pulse font-medium text-sm text-white/70">{t('drawing.interpreting')}</p>
                </div>
              )}
            </div>

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg border border-white/10 p-1">
                <Button variant={tool === 'pen'    ? 'secondary' : 'ghost'} size="sm" title={t('drawing.pen')}    onClick={() => setTool('pen')}>
                  <Pen className="size-3" />
                </Button>
                <Button variant={tool === 'eraser' ? 'secondary' : 'ghost'} size="sm" title={t('drawing.eraser')} onClick={() => setTool('eraser')}>
                  <Eraser className="size-3" />
                </Button>
              </div>

              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button"
                    className="size-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
                    style={{ backgroundColor: c, borderColor: color === c && tool === 'pen' ? 'white' : 'transparent' }}
                    onClick={() => { setColor(c); setTool('pen') }}
                  />
                ))}
              </div>

              <div className="flex gap-1">
                {BRUSH_SIZES.map((s) => (
                  <button key={s} type="button"
                    className="flex size-8 items-center justify-center rounded-md border border-white/10 hover:bg-white/10 focus:outline-none"
                    style={{ outline: brushSize === s ? '2px solid rgba(255,255,255,0.6)' : undefined, outlineOffset: 2 }}
                    onClick={() => setBrushSize(s)}
                  >
                    <span className="block rounded-full bg-white" style={{ width: Math.min(s, 20), height: Math.min(s, 20) }} />
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {error && <span className="text-destructive text-xs">{error}</span>}
                <Button variant="ghost" size="sm" onClick={clearCanvas} disabled={panelState === 'interpreting'}>
                  <Trash2 className="size-3" />{t('drawing.clear')}
                </Button>
                <Button size="sm" onClick={interpret} disabled={panelState === 'interpreting'}>
                  <Wand2 className="size-3" />{t('drawing.interpret')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Result sub-view (inside the same panel) ────────────────────────────────
function ResultView({ result, surfaceState, pendingSurface, onSearch, onOpenSurface, onDrawAgain }: {
  result: { description: string; domain: string; searchQuery: string; title: string; attributes: Record<string, string | number> }
  surfaceState: 'idle' | 'generating' | 'ready'
  pendingSurface: import('@/a2ui/drawingSurface').DrawingSurface | null
  onSearch: (q: string) => void
  onOpenSurface: () => void
  onDrawAgain: () => void
}) {
  const meta = DOMAIN_META[(result.domain as Domain)] ?? DOMAIN_META.web
  const Icon = meta.icon

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      {/* Domain + title */}
      <div className="flex items-center gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${meta.color}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="font-semibold text-white">{result.title}</p>
          <Badge variant="secondary" className="mt-0.5 font-mono text-[10px] uppercase">{meta.label}</Badge>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/70 leading-relaxed">{result.description}</p>
      </div>

      {/* Attributes */}
      {Object.keys(result.attributes).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(result.attributes).map(([k, v]) => (
            <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
          ))}
        </div>
      )}

      {/* Search query */}
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <span className="flex-1 truncate font-mono text-xs text-white/45">{result.searchQuery}</span>
      </div>

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-2">
        {/* Generative UI button — shows progress then becomes clickable */}
        <Button
          className="w-full"
          variant={surfaceState === 'ready' ? 'default' : 'secondary'}
          disabled={surfaceState === 'idle' || surfaceState === 'generating'}
          onClick={onOpenSurface}
        >
          {surfaceState === 'generating' ? (
            <><Loader2 className="mr-2 size-4 animate-spin" />Building interactive UI…</>
          ) : surfaceState === 'ready' ? (
            pendingSurface?.strategy === 'direct_search'
              ? <><Sparkles className="mr-2 size-4" />Search directly</>
              : <><Sparkles className="mr-2 size-4" />Open interactive UI</>
          ) : (
            <><Sparkles className="mr-2 size-4" />Interactive UI</>
          )}
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDrawAgain}>
            <PenLine className="mr-2 size-4" />
            Draw again
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onSearch(result.searchQuery)}>
            <Search className="mr-2 size-4" />
            Search with Lucy
          </Button>
        </div>
      </div>
    </div>
  )
}
