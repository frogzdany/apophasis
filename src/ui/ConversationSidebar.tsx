import { Layers, MessageSquare, Mic, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useT } from '@/hooks/useT'
import { type ConversationEvent, type ConversationEventKind, useStore } from '@/store'

const KIND_META: Record<
  ConversationEventKind,
  { Icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  user_speech: { Icon: Mic, tone: 'text-foreground' },
  lucy_speech: { Icon: MessageSquare, tone: 'text-primary' },
  render: { Icon: Layers, tone: 'text-sky-300' },
  update: { Icon: RefreshCw, tone: 'text-amber-300' },
  submit: { Icon: Send, tone: 'text-emerald-300' },
  close: { Icon: X, tone: 'text-muted-foreground' },
  search: { Icon: Search, tone: 'text-violet-300' },
  result: { Icon: Sparkles, tone: 'text-yellow-200' },
  note: { Icon: Sparkles, tone: 'text-muted-foreground' },
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function ConversationSidebar({ forceShow = false }: { forceShow?: boolean }) {
  const events = useStore((s) => s.events)
  const clearEvents = useStore((s) => s.clearEvents)
  const voiceActive = useStore((s) => s.voiceActive)
  const { t } = useT()
  const rootRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the bottom whenever the event list grows. Radix's
  // ScrollArea wraps content in an inner Viewport — that's the element that
  // actually scrolls, so we have to reach for it via the data attribute.
  // biome-ignore lint/correctness/useExhaustiveDependencies: events.length is the trigger, intentional
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    // Defer to the next frame so DOM has the freshly inserted entry.
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
  }, [events.length])

  if (!forceShow && !voiceActive && events.length === 0) return null

  return (
    <Card
      ref={rootRef}
      className="
        pointer-events-auto fixed top-14 bottom-24 left-0 z-20 flex
        w-[calc(100vw-2rem)] mx-4 overflow-hidden
        flex-col gap-3 border-white/10 bg-background/85 p-4 backdrop-blur-md
        md:top-6 md:left-6 md:mx-0 md:w-[min(380px,32vw)] md:bottom-24
      "
    >
      <div className="flex shrink-0 items-center justify-between">
        <Badge variant="secondary" className="font-mono uppercase tracking-wider">
          {t('sidebar.title')}
          <span className="ml-2 font-normal text-muted-foreground/60">{events.length}</span>
        </Badge>
        {events.length > 0 && (
          <Button variant="ghost" size="icon-xs" onClick={clearEvents} title={t('sidebar.clear')}>
            <X className="size-3" />
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 pr-3">
          {events.length === 0 && (
            <p className="text-muted-foreground text-xs italic">{t('sidebar.empty')}</p>
          )}
          {events.map((ev) => (
            <Entry key={ev.id} event={ev} />
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}

function Entry({ event }: { event: ConversationEvent }) {
  const meta = KIND_META[event.kind] ?? KIND_META.note
  const { Icon, tone } = meta
  return (
    <div className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2 text-xs">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span className="font-medium text-foreground/90 leading-snug break-words">
            {event.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            {formatTime(event.ts)}
          </span>
        </div>
        {event.detail && (
          <p className="break-words text-muted-foreground leading-snug">{event.detail}</p>
        )}
        {event.data && Object.keys(event.data).length > 0 && <DataPills data={event.data} />}
      </div>
    </div>
  )
}

function DataPills({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).slice(0, 12)
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]"
        >
          <span className="text-muted-foreground/70">{key}</span>
          <span className="truncate text-foreground/90">{formatValue(value)}</span>
        </span>
      ))}
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.join(', ')
  if (typeof value === 'object') {
    const keys = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== false && v !== undefined)
      .map(([k]) => k)
      .join(', ')
    return keys || '{}'
  }
  return String(value)
}
