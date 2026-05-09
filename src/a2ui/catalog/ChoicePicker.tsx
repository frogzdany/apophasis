import { createComponentImplementation } from '@a2ui/react/v0_9'
import { ChoicePickerApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { Check } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface OptionLike {
  label: string
  value: string
}

function normalizeOptions(raw: unknown): OptionLike[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return { label: entry, value: entry }
      if (entry && typeof entry === 'object') {
        const o = entry as Record<string, unknown>
        const value = String(o.value ?? o.label ?? '')
        const label = String(o.label ?? o.value ?? '')
        if (!value && !label) return null
        return { label, value }
      }
      return null
    })
    .filter((x): x is OptionLike => x !== null)
}

export const ChoicePicker = createComponentImplementation(ChoicePickerApi, ({ props }) => {
  const options = normalizeOptions(props.options)
  const selected: string[] = Array.isArray(props.value)
    ? props.value.map((v) => String(v))
    : props.value != null
      ? [String(props.value)]
      : []

  const isMulti = props.variant !== 'mutuallyExclusive'

  const onToggle = (value: string) => {
    if (isMulti) {
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
      props.setValue(next)
    } else {
      props.setValue([value])
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {props.label && (
        <Label className="text-xs font-medium text-foreground/80">{props.label}</Label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isOn = selected.includes(opt.value)
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors',
                isOn
                  ? 'border-primary/60 bg-primary/15 text-primary-foreground'
                  : 'border-white/15 bg-white/5 text-foreground/80 hover:border-white/30 hover:bg-white/10',
              )}
            >
              {isOn && <Check className="size-3" />}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})
