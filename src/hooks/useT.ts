import { useCallback } from 'react'
import { type Language, t } from '@/lib/messages'
import { useStore } from '@/store'

export function useT() {
  const language = useStore((s) => s.language)
  const translate = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(language, key, vars),
    [language],
  )
  return { t: translate, language }
}

export type { Language }
