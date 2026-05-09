import { Card } from '@/components/ui/card'
import { useT } from '@/hooks/useT'
import { useStore } from '@/store'

export function Transcript() {
  const inputT = useStore((s) => s.inputTranscript)
  const outputT = useStore((s) => s.outputTranscript)
  const chunksSent = useStore((s) => s.chunksSent)
  const micLevel = useStore((s) => s.micLevel)
  const voiceActive = useStore((s) => s.voiceActive)
  const phase = useStore((s) => s.phase)
  const { t } = useT()

  if (!voiceActive && !inputT && !outputT) return null

  // Lucy is processing/responding but hasn't streamed any text yet — show a
  // breathing dot so the user knows the request is in flight.
  const showLucyPending = phase === 'thinking' && !outputT

  return (
    <Card className="pointer-events-none fixed top-6 left-1/2 z-10 w-[min(640px,92vw)] -translate-x-1/2 gap-1.5 border-white/10 bg-background/55 px-4 py-3 text-sm backdrop-blur-md">
      <Row label={t('transcript.you')} text={inputT} />
      <Row label={t('transcript.lucy')} text={outputT} pending={showLucyPending} />
      <div className="text-[10px] tracking-wide text-muted-foreground/70">
        {t('transcript.meta', { n: chunksSent, rms: (micLevel * 100).toFixed(2) })}
      </div>
    </Card>
  )
}

function Row({ label, text, pending }: { label: string; text: string; pending?: boolean }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="min-w-[36px] text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {label}
      </span>
      <span className="flex-1 leading-snug">{text || (pending ? <PendingDots /> : '…')}</span>
    </div>
  )
}

function PendingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
    </span>
  )
}
