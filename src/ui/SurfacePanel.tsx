import { A2uiSurface } from '@a2ui/react/v0_9'
import type { SurfaceModel } from '@a2ui/web_core/v0_9'
import { Loader2, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getProcessor } from '@/a2ui/processor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useT } from '@/hooks/useT'
import { useStore } from '@/store'

// biome-ignore lint/suspicious/noExplicitAny: SurfaceModel ComponentApi generic is opaque to consumers
type AnySurface = SurfaceModel<any>

export function SurfacePanel() {
  const activeSurfaceId = useStore((s) => s.activeSurfaceId)
  const iteration = useStore((s) =>
    activeSurfaceId ? (s.iterationBySurface[activeSurfaceId] ?? 1) : 0,
  )
  const unregisterSurface = useStore((s) => s.unregisterSurface)
  const [surfaces, setSurfaces] = useState<Record<string, AnySurface>>({})
  const { t } = useT()

  useEffect(() => {
    const processor = getProcessor()
    const created = processor.onSurfaceCreated((s) => {
      setSurfaces((prev) => ({ ...prev, [s.id]: s as AnySurface }))
    })
    const deleted = processor.onSurfaceDeleted((id) => {
      setSurfaces((prev) => {
        const { [id]: _drop, ...rest } = prev
        return rest
      })
    })
    return () => {
      created.unsubscribe()
      deleted.unsubscribe()
    }
  }, [])

  const surfacePending = useStore((s) => s.surfacePending)

  // Show a shimmer placeholder while Lucy's render is in flight (between
  // the toolCall and the surface mounting in the renderer).
  if (!activeSurfaceId) {
    if (surfacePending) {
      return (
        <Card className="pointer-events-auto fixed top-1/2 right-6 z-20 flex w-[min(440px,42vw)] -translate-y-1/2 items-center gap-2 border-white/10 bg-background/85 p-5 backdrop-blur-md">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">{t('surface.preparing')}</span>
        </Card>
      )
    }
    return null
  }
  const surface = surfaces[activeSurfaceId]
  if (!surface) return null

  // Always-available submit. Routes through the surface's own action
  // dispatcher so the existing voice-session listener picks it up exactly
  // as if a Button inside the surface had fired.
  const onManualSend = () => {
    surface.dispatchAction({ name: 'submit' }, 'manual_send_button')
  }

  return (
    <Card className="pointer-events-auto fixed top-1/2 right-6 z-20 flex w-[min(440px,42vw)] -translate-y-1/2 flex-col gap-3 border-white/10 bg-background/85 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="font-mono uppercase tracking-wider">
          {t('surface.iter', { id: activeSurfaceId, n: iteration })}
        </Badge>
        <div className="flex items-center gap-1">
          {/* Fallback Send — icon-only so Lucy's in-surface Button stays the
              primary submit affordance and the header doesn't compete. */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onManualSend}
            title={t('surface.sendManual')}
            aria-label={t('surface.sendManual')}
          >
            <Send className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => unregisterSurface(activeSurfaceId)}
            aria-label={t('surface.close')}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
      <div className="a2ui-surface text-foreground">
        <A2uiSurface surface={surface} />
      </div>
    </Card>
  )
}
