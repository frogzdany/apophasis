import { Book, Globe, MapPin, Music, Search, ShoppingBag, Video, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'

type Domain = 'music' | 'video' | 'book' | 'place' | 'product' | 'web'

interface ResultArgs {
  title: string
  description: string
  domain: Domain | string
  searchQuery: string
  attributes?: Record<string, string | number>
}

const DOMAIN_META: Record<
  Domain,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  music: { icon: Music, label: 'Music', color: 'text-pink-400' },
  video: { icon: Video, label: 'Video', color: 'text-red-400' },
  book: { icon: Book, label: 'Books', color: 'text-amber-400' },
  place: { icon: MapPin, label: 'Places', color: 'text-emerald-400' },
  product: { icon: ShoppingBag, label: 'Products', color: 'text-blue-400' },
  web: { icon: Globe, label: 'Web', color: 'text-sky-400' },
}

function ResultCard({
  title,
  description,
  domain,
  searchQuery,
  attributes,
  onSearch,
  onDismiss,
}: ResultArgs & { onSearch: (q: string) => void; onDismiss?: () => void }) {
  const meta = DOMAIN_META[(domain as Domain) ?? 'web'] ?? DOMAIN_META.web
  const Icon = meta.icon

  return (
    <div className="pointer-events-auto w-80 rounded-2xl border border-white/15 bg-background/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${meta.color}`} />
        <div className="flex-1">
          <p className="font-semibold text-sm text-white leading-tight">{title}</p>
          <Badge variant="secondary" className="mt-1 font-mono text-[10px] uppercase tracking-wider">
            {meta.label}
          </Badge>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-white/30 hover:text-white/70">
            <X className="size-4" />
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-white/60 leading-relaxed">{description}</p>

      {attributes && Object.keys(attributes).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {Object.entries(attributes).map(([k, v]) => (
            <Badge key={k} variant="outline" className="text-[10px]">
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
        <span className="flex-1 truncate font-mono text-[11px] text-white/45">{searchQuery}</span>
        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => onSearch(searchQuery)}>
          <Search className="mr-1 size-3" />
          Search
        </Button>
      </div>
    </div>
  )
}

export function DrawingResultPanel() {
  const interpretation = useStore((s) => s.drawingInterpretation)
  const setDrawingInterpretation = useStore((s) => s.setDrawingInterpretation)
  const addEvent = useStore((s) => s.addEvent)

  if (!interpretation) return null

  const handleSearch = (query: string) => {
    addEvent({ kind: 'note', title: 'Searching from drawing', detail: query })
    window.dispatchEvent(new CustomEvent('lucyDrawingContext', { detail: query }))
    setDrawingInterpretation(null)
  }

  return (
    <div className="fixed bottom-24 right-4 z-40">
      <ResultCard
        title={interpretation.title}
        description={interpretation.description}
        domain={interpretation.domain}
        searchQuery={interpretation.searchQuery}
        attributes={interpretation.attributes}
        onSearch={handleSearch}
        onDismiss={() => setDrawingInterpretation(null)}
      />
    </div>
  )
}
