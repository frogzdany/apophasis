import { useCallback, useState } from 'react'

const STORAGE_KEY = 'lucy-onboarding-seen'

export function useOnboarding() {
  const [running, setRunning] = useState(false)

  const hasSeen = () => localStorage.getItem(STORAGE_KEY) === '1'

  const startTour = useCallback(() => setRunning(true), [])

  const finishTour = useCallback(() => {
    setRunning(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  return { running, startTour, finishTour, hasSeen }
}
