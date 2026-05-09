import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/hooks/useT'
import { useStore } from '@/store'

export function MicSelector() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const selectedMicId = useStore((s) => s.selectedMicId)
  const setSelectedMicId = useStore((s) => s.setSelectedMicId)
  const { t } = useT()

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // enumerateDevices returns empty labels until mic permission has
        // been granted at least once. Briefly request a stream so labels
        // populate, then drop it.
        let probeStream: MediaStream | null = null
        try {
          probeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          /* permission denied or already revoked */
        }

        const list = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) {
          setDevices(list.filter((d) => d.kind === 'audioinput'))
        }
        probeStream?.getTracks().forEach((track) => {
          track.stop()
        })
      } catch (e) {
        console.error('[lucy] enumerateDevices failed', e)
      }
    }

    load()
    navigator.mediaDevices.addEventListener?.('devicechange', load)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener?.('devicechange', load)
    }
  }, [])

  return (
    <Select value={selectedMicId} onValueChange={setSelectedMicId}>
      <SelectTrigger size="sm" className="max-w-[220px]" title={t('mic.title')}>
        <SelectValue placeholder={t('mic.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">{t('mic.default')}</SelectItem>
        {devices.map((d) => (
          <SelectItem key={d.deviceId} value={d.deviceId}>
            {d.label || t('mic.unnamed', { id: d.deviceId.slice(0, 6) })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
