import { FlaskConical, Languages, Mic, MicOff, MoreHorizontal, Sparkles, Zap } from 'lucide-react'
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
  const voiceActive = useStore((s) => s.voiceActive)
  const lite = useStore((s) => s.lite)
  const toggleLite = useStore((s) => s.toggleLite)
  const language = useStore((s) => s.language)
  const toggleLanguage = useStore((s) => s.toggleLanguage)
  const registerSurface = useStore((s) => s.registerSurface)
  const { start, stop, error } = useVoiceSession()
  const { t } = useT()

  const onTest = (preset: DemoPreset) => {
    const id = dispatchDemoSurface(preset)
    registerSurface(id)
  }

  return (
    <div data-tour="controls" className="pointer-events-auto fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-background/55 px-3 py-2 backdrop-blur-md md:bottom-7">
      <Badge variant="secondary" className="font-mono uppercase tracking-widest">
        {t(`phase.${phase}`)}
      </Badge>
      {/* Desktop-only: mic, voice, next phase inline */}
      <span className="hidden md:contents">
        <MicSelector />
        <VoiceSelector />
        <Button variant="ghost" size="sm" onClick={cyclePhase}>
          <Sparkles className="size-3" />
          {t('controls.next')}
        </Button>
      </span>
      {/* Language toggle — always visible */}
      <Button
        data-tour="lang-toggle"
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        title={t('controls.langTooltip')}
        aria-label={t('controls.langTooltip')}
      >
        <Languages className="size-3" />
        {LANGUAGE_LABEL[language]}
      </Button>
      {/* Talk / Stop — always visible */}
      {voiceActive ? (
        <Button variant="destructive" size="sm" onClick={stop}>
          <MicOff className="size-3" />
          {t('controls.stop')}
        </Button>
      ) : (
        <Button data-tour="talk-button" size="sm" onClick={start}>
          <Mic className="size-3" />
          {t('controls.talk')}
        </Button>
      )}
      {/* Desktop-only: test, lite inline */}
      <span className="hidden md:contents">
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
          data-tour="lite-toggle"
          variant={lite ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleLite}
          title={t('controls.liteTooltip')}
        >
          <Zap className="size-3" />
          {lite ? t('controls.liteOn') : t('controls.lite')}
        </Button>
      </span>
      {/* Mobile-only: "More" popover with remaining controls */}
      <span className="contents md:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" title="More options">
              <MoreHorizontal className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            className="flex w-48 flex-col gap-1 border-white/10 bg-background/90 p-2 backdrop-blur-md"
          >
            <Button variant="ghost" size="sm" className="justify-start" onClick={cyclePhase}>
              <Sparkles className="size-3" />
              {t('controls.next')}
            </Button>
            <Button
              variant={lite ? 'secondary' : 'ghost'}
              size="sm"
              className="justify-start"
              onClick={toggleLite}
            >
              <Zap className="size-3" />
              {lite ? t('controls.liteOn') : t('controls.lite')}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="justify-start">
                  <FlaskConical className="size-3" />
                  {t('controls.test')}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="top"
                className="flex w-48 flex-col gap-1 border-white/10 bg-background/90 p-2 backdrop-blur-md"
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
          </PopoverContent>
        </Popover>
      </span>
      {error && <span className="ml-1 max-w-[280px] text-destructive text-xs">{error}</span>}
    </div>
  )
}
