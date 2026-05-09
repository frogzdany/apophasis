import { createComponentImplementation } from '@a2ui/react/v0_9'
import { CardApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { CardContent, Card as ShadCard } from '@/components/ui/card'

export const Card = createComponentImplementation(CardApi, ({ props, buildChild }) => {
  return (
    <ShadCard className="border-white/10 bg-card/60 p-4">
      <CardContent className="p-0">
        {typeof props.child === 'string' ? buildChild(props.child) : null}
      </CardContent>
    </ShadCard>
  )
})
