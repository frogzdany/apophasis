import { createComponentImplementation } from '@a2ui/react/v0_9'
import { RowApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { renderChildren } from './helpers'

export const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => {
  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      {renderChildren(props.children, buildChild)}
    </div>
  )
})
