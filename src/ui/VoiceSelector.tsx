import { AudioLines } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VOICE_DESCRIPTIONS, VOICE_NAMES, type VoiceName } from '@/gemini/liveSession'
import { useT } from '@/hooks/useT'
import { useStore } from '@/store'

export function VoiceSelector() {
  const voiceName = useStore((s) => s.voiceName)
  const setVoiceName = useStore((s) => s.setVoiceName)
  const { t } = useT()

  return (
    <Select value={voiceName} onValueChange={(v) => setVoiceName(v as VoiceName)}>
      <SelectTrigger size="sm" className="w-[124px]" title={t('voice.title')}>
        {/* Override the default SelectValue rendering so the trigger shows
            only the name on a single line — the description belongs in the
            dropdown only. */}
        <SelectValue asChild>
          <span className="flex items-center gap-1.5">
            <AudioLines className="size-3 text-muted-foreground" />
            <span className="text-sm">{voiceName}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {VOICE_NAMES.map((name) => (
          <SelectItem key={name} value={name}>
            <div className="flex flex-col">
              <span className="text-sm">{name}</span>
              <span className="text-muted-foreground text-xs">{VOICE_DESCRIPTIONS[name]}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
