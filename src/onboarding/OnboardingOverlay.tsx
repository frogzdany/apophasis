import { useMemo } from 'react'
import { Joyride, STATUS, type EventData } from 'react-joyride'
import { useT } from '@/hooks/useT'
import { getTourSteps } from './steps'

interface OnboardingOverlayProps {
  run: boolean
  onDone: () => void
}

export function OnboardingOverlay({ run, onDone }: OnboardingOverlayProps) {
  const { t, language } = useT()
  const steps = useMemo(() => getTourSteps(t), [t])

  const handleEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      onDone()
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      options={{
        buttons: ['back', 'primary', 'skip'],
        showProgress: true,
        overlayClickAction: false,
        backgroundColor: 'rgba(15, 16, 22, 0.92)',
        textColor: '#e4e4e7',
        primaryColor: '#7c3aed',
        overlayColor: 'rgba(0, 0, 0, 0.7)',
        spotlightRadius: 12,
        zIndex: 10000,
        shiftOptions: { padding: 40 },
        flipOptions: { padding: 40 },
        offset: 16,
      }}
      locale={{
        back: t('tour.btn.back'),
        close: t('tour.btn.close'),
        last: t('tour.btn.last'),
        next: t('tour.btn.next'),
        nextWithProgress: t('tour.btn.nextProgress'),
        open: t('tour.btn.open'),
        skip: t('tour.btn.skip'),
      }}
      styles={{
        tooltip: {
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          fontSize: '14px',
          padding: '16px 20px',
          maxWidth: '380px',
        },
        tooltipContent: {
          padding: '8px 0',
          lineHeight: '1.6',
          textAlign: 'left',
        },
        buttonPrimary: {
          borderRadius: '8px',
          fontSize: '13px',
          padding: '6px 16px',
        },
        buttonBack: {
          color: '#a1a1aa',
          fontSize: '13px',
        },
        buttonSkip: {
          color: '#71717a',
          fontSize: '12px',
        },
        buttonClose: {
          display: 'none',
        },
      }}
    />
  )
}
