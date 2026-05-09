import {
  Book,
  Disc3,
  ExternalLink,
  Film,
  Globe,
  Loader2,
  MapPin,
  Music,
  Package,
  Pause,
  Play,
  Sparkles,
  Video,
  X,
} from 'lucide-react'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useT } from '@/hooks/useT'
import type { SearchKind, SearchResult } from '@/lib/search/types'
import { useStore } from '@/store'

const KIND_ICON: Record<SearchKind, ComponentType<{ className?: string }>> = {
  music: Music,
  video: Video,
  book: Book,
  movie: Film,
  web: Globe,
  place: MapPin,
  product: Package,
  other: Sparkles,
}

export function ResultGallery() {
  const results = useStore((s) => s.lastSearchResults)
  const query = useStore((s) => s.lastSearchQuery)
  const pending = useStore((s) => s.searchPending)
  const clearSearchResults = useStore((s) => s.clearSearchResults)
  const surfacePresent = useStore((s) => s.activeSurfaceId !== null)
  const { t } = useT()

  if (surfacePresent) return null
  if (!pending && !results) return null

  return (
    <Card className="pointer-events-auto fixed top-1/2 right-6 z-20 flex w-[min(440px,42vw)] -translate-y-1/2 flex-col gap-3 border-white/10 bg-background/85 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="font-mono uppercase tracking-wider">
          {t('gallery.title')}
          {results && (
            <span className="ml-2 font-normal text-muted-foreground/60">{results.length}</span>
          )}
        </Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clearSearchResults}
          aria-label={t('gallery.dismiss')}
        >
          <X className="size-3" />
        </Button>
      </div>

      {query && <p className="font-mono text-[11px] text-muted-foreground/80">{query}</p>}

      {pending && !results && <Skeleton t={t} />}

      {results && results.length === 0 && (
        <p className="text-muted-foreground text-sm italic">{t('gallery.empty')}</p>
      )}

      {results && results.length > 0 && (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
          {results.map((r) => (
            <ResultCard key={r.id} result={r} t={t} />
          ))}
        </div>
      )}
    </Card>
  )
}

function Skeleton({ t }: { t: ReturnType<typeof useT>['t'] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {t('gallery.pending')}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-md border border-white/5 bg-white/[0.03] p-3"
        >
          <div className="size-12 shrink-0 rounded bg-white/10" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-3/4 rounded bg-white/10" />
            <div className="h-2.5 w-1/2 rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultCard({ result, t }: { result: SearchResult; t: ReturnType<typeof useT>['t'] }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <Thumb result={result} />
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-sm leading-snug">{result.title}</p>
        {result.subtitle && (
          <p className="break-words text-muted-foreground text-xs">{result.subtitle}</p>
        )}
        {result.description && result.description !== result.subtitle && (
          <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground/80 text-xs">
            {result.description}
          </p>
        )}
        <Facets result={result} />
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Preview result={result} t={t} />
          {result.externalUrl && (
            <Button variant="ghost" size="xs" asChild>
              <a href={result.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                {t(`gallery.open.${result.kind}`)}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Thumb({ result }: { result: SearchResult }) {
  const Icon = KIND_ICON[result.kind] ?? Disc3
  if (result.imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: vanilla Vite, not Next.js
      <img
        src={result.imageUrl}
        alt=""
        loading="lazy"
        className="size-14 shrink-0 rounded border border-white/10 object-cover"
      />
    )
  }
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5">
      <Icon className="size-5 text-muted-foreground" />
    </div>
  )
}

function Facets({ result }: { result: SearchResult }) {
  const entries = Object.entries(result.facets ?? {})
  if (entries.length === 0 && !result.reason) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/70">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full border border-white/10 px-1.5 py-px font-mono">
          {String(v)}
        </span>
      ))}
      {result.reason && <span className="italic">· {result.reason}</span>}
    </div>
  )
}

function Preview({ result, t }: { result: SearchResult; t: ReturnType<typeof useT>['t'] }) {
  if (!result.preview) return null
  if (result.preview.kind === 'audio') return <AudioPreview url={result.preview.url} t={t} />
  if (result.preview.kind === 'video' || result.preview.kind === 'iframe') {
    return <IframePreview url={result.preview.url} t={t} />
  }
  return null
}

function AudioPreview({ url, t }: { url: string; t: ReturnType<typeof useT>['t'] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      audio?.pause()
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else void audio.play().catch((err) => console.warn('[gallery] audio play failed', err))
  }

  return (
    <>
      <Button variant="secondary" size="xs" onClick={toggle}>
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
        {t('gallery.preview')}
      </Button>
      <audio
        ref={audioRef}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        <track kind="captions" />
      </audio>
    </>
  )
}

function IframePreview({ url, t }: { url: string; t: ReturnType<typeof useT>['t'] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" size="xs" onClick={() => setOpen((v) => !v)}>
        <Play className="size-3" />
        {t('gallery.preview')}
      </Button>
      {open && (
        <div className="mt-2 w-full overflow-hidden rounded border border-white/10">
          <iframe
            title="preview"
            src={url}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </>
  )
}
