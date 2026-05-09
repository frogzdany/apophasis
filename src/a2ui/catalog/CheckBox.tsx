import { createComponentImplementation } from '@a2ui/react/v0_9'
import { CheckBoxApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export const CheckBox = createComponentImplementation(CheckBoxApi, ({ props }) => {
  const id = useId()
  const checked = Boolean(props.value)

  return (
    <div className="flex items-center gap-2 py-0.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => props.setValue(next === true)}
      />
      {props.label && (
        <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
          {props.label}
        </Label>
      )}
    </div>
  )
})
