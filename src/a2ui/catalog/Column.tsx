import { createComponentImplementation } from '@a2ui/react/v0_9'
import { ColumnApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { renderChildren } from './helpers'

export const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => {
  return <div className="flex flex-col gap-3">{renderChildren(props.children, buildChild)}</div>
})
