import { createComponentImplementation } from '@a2ui/react/v0_9'
import { TextFieldApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export const TextField = createComponentImplementation(TextFieldApi, ({ props }) => {
  const id = useId()
  const variant = props.variant ?? 'shortText'
  const isLong = variant === 'longText'
  const inputType = variant === 'number' ? 'number' : variant === 'obscured' ? 'password' : 'text'

  const value = props.value == null ? '' : String(props.value)
  const errors = (props.validationErrors as string[] | undefined) ?? []
  const hasError = errors.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      {props.label && (
        <Label htmlFor={id} className="text-xs font-medium text-foreground/80">
          {props.label}
        </Label>
      )}
      {isLong ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => props.setValue(e.target.value)}
          className="min-h-[64px]"
          aria-invalid={hasError}
        />
      ) : (
        <Input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => props.setValue(e.target.value)}
          aria-invalid={hasError}
        />
      )}
      {errors.map((err) => (
        <p key={err} className="text-destructive text-xs">
          {err}
        </p>
      ))}
    </div>
  )
})
