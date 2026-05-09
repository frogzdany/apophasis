// Top-right pill that lets the user share their browser geolocation. The
// resolved coords + reverse-geocoded label flow into the store and, when
// the next session connects, into Lucy's system instruction so she
// prefers `search_places_nearby` for "near me" intent.
//
// Status is driven by useStore; the matching browser prompt + reverse-
// geocode HTTP call are kicked off from this component.

import { Info, Loader2, MapPin, MapPinOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/useT'
import { isGeolocationFailure, requestUserLocation } from '@/lib/geolocation'
import { logEvent } from '@/lib/sessionLogger'
import { useStore } from '@/store'

const GEOCODE_ENDPOINT = '/api/geocode/reverse'

async function reverseGeocode(lat: number, lng: number, hl: string): Promise<string | undefined> {
  try {
    const res = await fetch(GEOCODE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat, lng, hl }),
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { label?: string }
    return body?.label
  } catch {
    return undefined
  }
}

export function LocationToggle() {
  const status = useStore((s) => s.userLocationStatus)
  const location = useStore((s) => s.userLocation)
  const language = useStore((s) => s.language)
  const setUserLocation = useStore((s) => s.setUserLocation)
  const setUserLocationStatus = useStore((s) => s.setUserLocationStatus)
  const clearUserLocation = useStore((s) => s.clearUserLocation)
  const { t } = useT()
  const [infoOpen, setInfoOpen] = useState(false)

  const isGranted = status === 'granted' && !!location
  const isWorking = status === 'requesting'

  const onShare = async () => {
    setUserLocationStatus('requesting')
    logEvent('location.request')
    try {
      const coords = await requestUserLocation()
      // Coords land first so Lucy has *something* even if reverse geocode
      // fails. The label is merged in once geocoding resolves.
      setUserLocation(coords, 'granted')
      logEvent('location.granted', { accuracy: coords.accuracy })
      const label = await reverseGeocode(coords.lat, coords.lng, language)
      if (label) {
        setUserLocation({ ...coords, label }, 'granted')
        logEvent('location.geocoded', { label })
      }
    } catch (err) {
      const failure = isGeolocationFailure(err) ? err : { kind: 'unknown' as const }
      const status =
        failure.kind === 'denied' ||
        failure.kind === 'unavailable' ||
        failure.kind === 'timeout' ||
        failure.kind === 'unsupported'
          ? failure.kind
          : 'unavailable'
      setUserLocationStatus(status)
      logEvent('location.failure', { kind: failure.kind })
    }
  }

  const onClear = () => {
    clearUserLocation()
    logEvent('location.cleared')
  }

  const onClick = () => {
    if (isGranted) {
      onClear()
      return
    }
    if (isWorking) return
    void onShare()
  }

  const labelText = (() => {
    if (isWorking) return t('location.requesting')
    if (isGranted) return location?.label ?? t('location.granted')
    if (status === 'denied') return t('location.denied')
    if (status === 'unavailable') return t('location.unavailable')
    if (status === 'timeout') return t('location.timeout')
    if (status === 'unsupported') return t('location.unsupported')
    return t('location.share')
  })()

  // The granted state shows the resolved label (which can be long, e.g.
  // "Mexico City, Ciudad de Mexico, Mexico"); cap the visible width so it
  // doesn't push off-screen on mobile. Full label still shows in the
  // tooltip (title attr) and in the info popover.
  return (
    <div
      data-tour="location-toggle"
      className="pointer-events-auto fixed top-4 right-4 z-10 flex items-center gap-1 rounded-full border border-white/10 bg-background/55 px-2 py-1 backdrop-blur-md"
    >
      <Button
        variant={isGranted ? 'secondary' : 'ghost'}
        size="sm"
        onClick={onClick}
        disabled={isWorking || status === 'unsupported'}
        title={isGranted ? `${labelText} — ${t('location.clear')}` : t('location.tooltip')}
        aria-label={t('location.share')}
      >
        {isWorking ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isGranted ? (
          <MapPin className="size-3" />
        ) : status === 'denied' || status === 'unsupported' ? (
          <MapPinOff className="size-3" />
        ) : (
          <MapPin className="size-3" />
        )}
        <span className="max-w-[160px] truncate">{labelText}</span>
      </Button>
      <Popover open={infoOpen} onOpenChange={setInfoOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('location.infoTitle')}
            aria-label={t('location.infoTitle')}
          >
            <Info className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          className="max-w-[280px] border-white/10 bg-background/90 p-3 text-xs backdrop-blur-md"
        >
          <p className="mb-1 font-medium text-foreground/90">{t('location.infoTitle')}</p>
          <p className="text-muted-foreground leading-snug">{t('location.infoBody')}</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
