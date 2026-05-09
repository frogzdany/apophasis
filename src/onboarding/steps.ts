import { createElement } from 'react'
import type { Step } from 'react-joyride'

/** Targets that are hidden on mobile (inside `hidden md:contents` spans). */
const DESKTOP_ONLY = new Set([
  '[data-tour="voice-selector"]',
  '[data-tour="mic-selector"]',
  '[data-tour="lang-toggle"]',
  '[data-tour="lite-toggle"]',
])

/** Build the welcome step's rich content using translated strings. */
function welcomeContent(t: (key: string) => string) {
  return createElement('div', null,
    createElement('p', null, t('tour.welcome')),
    createElement('p', { style: { fontStyle: 'italic', opacity: 0.8, margin: '10px 0' } },
      t('tour.welcome.q1'),
      createElement('br'),
      t('tour.welcome.q2'),
      createElement('br'),
      t('tour.welcome.q3'),
    ),
    createElement('p', null, t('tour.welcome.cta')),
  )
}

/** Returns tour steps, filtering out desktop-only targets on narrow viewports. */
export function getTourSteps(t: (key: string) => string): Step[] {
  const allSteps: Step[] = [
    {
      target: '[data-tour="blob"]',
      content: welcomeContent(t),
      placement: 'center',
      skipBeacon: true,
    },
    {
      target: '[data-tour="blob"]',
      content: t('tour.howItWorks'),
      placement: 'center',
      skipBeacon: true,
    },
    {
      target: '[data-tour="blob"]',
      content: t('tour.lucy'),
      placement: 'center',
      skipBeacon: true,
    },
    {
      target: '[data-tour="controls"]',
      content: t('tour.controls'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="talk-button"]',
      content: t('tour.talkButton'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="voice-selector"]',
      content: t('tour.voiceSelector'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="mic-selector"]',
      content: t('tour.micSelector'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="lang-toggle"]',
      content: t('tour.langToggle'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="lite-toggle"]',
      content: t('tour.liteToggle'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="blob"]',
      content: t('tour.closing'),
      placement: 'center',
      skipBeacon: true,
    },
  ]

  const isMobile = window.matchMedia('(max-width: 767px)').matches
  if (!isMobile) return allSteps
  return allSteps.filter((s) => !DESKTOP_ONLY.has(s.target as string))
}
