import type { ReactNode } from 'react'

// A2UI v0.9 may pass children as a plain array of ids, an object
// `{ explicitList: [...] }`, or a template form. We only need explicit
// arrays for our catalog right now — fall back gracefully otherwise.
export function renderChildren(
  children: unknown,
  buildChild: (id: string) => ReactNode,
): ReactNode {
  if (Array.isArray(children)) {
    return children.map((id) =>
      typeof id === 'string' ? <ChildSlot key={id} id={id} render={buildChild} /> : null,
    )
  }
  if (children && typeof children === 'object' && 'explicitList' in children) {
    const list = (children as { explicitList: unknown }).explicitList
    if (Array.isArray(list)) {
      return list.map((id) =>
        typeof id === 'string' ? <ChildSlot key={id} id={id} render={buildChild} /> : null,
      )
    }
  }
  return null
}

function ChildSlot({ id, render }: { id: string; render: (id: string) => ReactNode }) {
  return <>{render(id)}</>
}

export function stripMarkdownHeading(text: string): string {
  // Defense against the model leaking '### Heading' into Text bodies — we
  // already steer it via prompt, but this keeps stale sessions sane.
  return text.replace(/^#{1,6}\s+/, '')
}
