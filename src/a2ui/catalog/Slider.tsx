import { createComponentImplementation } from '@a2ui/react/v0_9'
import { SliderApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Slider as ShadSlider } from '@/components/ui/slider'

export const Slider = createComponentImplementation(SliderApi, ({ props }) => {
  const id = useId()
  const min = typeof props.min === 'number' ? props.min : 0
  const max = typeof props.max === 'number' ? props.max : 100
  // SliderApi has no step in its schema; pick a sensible default from the
  // numeric range (continuous-style for [-1, 1] or [0, 1], integer for big
  // ranges like 40..200).
  const stepRaw = (props as { step?: number }).step
  const step =
    typeof stepRaw === 'number' && stepRaw > 0 ? stepRaw : Math.abs(max - min) <= 2 ? 0.05 : 1
  const raw = props.value
  const value =
    typeof raw === 'number' ? raw : raw == null ? min : Number.parseFloat(String(raw)) || min
  const display = Number.isInteger(step) ? Math.round(value) : Number.parseFloat(value.toFixed(2))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        {props.label ? (
          <Label htmlFor={id} className="text-xs font-medium text-foreground/80">
            {props.label}
          </Label>
        ) : (
          <span />
        )}
        <span className="font-mono text-muted-foreground text-xs">{display}</span>
      </div>
      <ShadSlider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => props.setValue(v[0])}
        className="w-full"
      />
    </div>
  )
})
