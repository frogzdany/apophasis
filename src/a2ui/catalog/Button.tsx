import { createComponentImplementation } from '@a2ui/react/v0_9'
import { ButtonApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { Button as ShadButton } from '@/components/ui/button'

export const Button = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const variant =
    props.variant === 'primary' ? 'default' : props.variant === 'borderless' ? 'ghost' : 'secondary'

  return (
    <ShadButton
      variant={variant}
      size="default"
      onClick={() => props.action?.()}
      disabled={props.isValid === false}
      className="w-fit font-semibold tracking-tight"
    >
      {typeof props.child === 'string' ? (
        <span className="[&_*]:text-current">{buildChild(props.child)}</span>
      ) : null}
    </ShadButton>
  )
})
