import { FlaskConical, Languages, Mic, MicOff, Sparkles, Zap } from 'lucide-react'
import { DEMO_LABELS, DEMO_PRESETS, type DemoPreset, dispatchDemoSurface } from '@/a2ui/demoSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/useT'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { LANGUAGE_LABEL } from '@/lib/messages'
import { useStore } from '@/store'
import { MicSelector } from './MicSelector'
import { VoiceSelector } from './VoiceSelector'

export function Controls() {
  const phase = useStore((s) => s.phase)
  const cyclePhase = useStore((s) => s.cyclePhase)
  const micMuted = useStore((s) => s.micMuted)
  const voiceActive = useStore((s) => s.voiceActive)
  const lite = useStore((s) => s.lite)
  const toggleLite = useStore((s) => s.toggleLite)
  const language = useStore((s) => s.language)
  const toggleLanguage = useStore((s) => s.toggleLanguage)
  const registerSurface = useStore((s) => s.registerSurface)
  const { start, stop, toggleMute, error } = useVoiceSession()
  const { t } = useT()

  const onTest = (preset: DemoPreset) => {
    const id = dispatchDemoSurface(preset)
    registerSurface(id)
  }

  return (
    <div className="pointer-events-auto fixed bottom-7 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-background/55 px-3 py-2 backdrop-blur-md">
      <Badge variant="secondary" className="font-mono uppercase tracking-widest">
        {t(`phase.${phase}`)}
      </Badge>
      <MicSelector />
      <VoiceSelector />
      <Button variant="ghost" size="sm" onClick={cyclePhase}>
        <Sparkles className="size-3" />
        {t('controls.next')}
      </Button>
      {voiceActive ? (
        <>
          <Button variant={micMuted ? 'secondary' : 'ghost'} size="sm" onClick={toggleMute}>
            {micMuted ? <Mic className="size-3" /> : <MicOff className="size-3" />}
            {micMuted ? t('controls.unmute') : t('controls.mute')}
          </Button>
          <Button variant="destructive" size="sm" onClick={stop}>
            <MicOff className="size-3" />
            {t('controls.stop')}
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={start}>
          <Mic className="size-3" />
          {t('controls.talk')}
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" title={t('controls.testTooltip')}>
            <FlaskConical className="size-3" />
            {t('controls.test')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex w-56 flex-col gap-1 border-white/10 bg-background/90 p-2 backdrop-blur-md"
        >
          {DEMO_PRESETS.map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => onTest(preset)}
            >
              {t(`preset.${preset}`) || DEMO_LABELS[preset]}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        variant={lite ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleLite}
        title={t('controls.liteTooltip')}
      >
        <Zap className="size-3" />
        {lite ? t('controls.liteOn') : t('controls.lite')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        title={t('controls.langTooltip')}
        aria-label={t('controls.langTooltip')}
      >
        <Languages className="size-3" />
        {LANGUAGE_LABEL[language]}
      </Button>
      {error && <span className="ml-1 max-w-[280px] text-destructive text-xs">{error}</span>}
    </div>
  )
}
