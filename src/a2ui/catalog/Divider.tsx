import { createComponentImplementation } from '@a2ui/react/v0_9'
import { DividerApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { Separator } from '@/components/ui/separator'

export const Divider = createComponentImplementation(DividerApi, ({ props }) => {
  const orientation = props.axis === 'vertical' ? 'vertical' : 'horizontal'
  return (
    <Separator
      orientation={orientation}
      className={orientation === 'horizontal' ? 'my-1 bg-white/10' : 'mx-1 bg-white/10'}
    />
  )
})
