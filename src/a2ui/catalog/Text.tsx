import { createComponentImplementation } from '@a2ui/react/v0_9'
import { TextApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { cn } from '@/lib/utils'
import { stripMarkdownHeading } from './helpers'

// All variants use [color:inherit] so when a Text is nested inside a Button
// (its label) it picks up the button's foreground color instead of forcing
// muted/foreground here. The SurfacePanel sets a base text color for the
// "free" Text components so they remain readable on the dark card.
const variantClasses: Record<string, string> = {
  h1: 'text-2xl font-semibold tracking-tight [color:inherit]',
  h2: 'text-xl font-semibold tracking-tight [color:inherit]',
  h3: 'text-lg font-semibold [color:inherit]',
  h4: 'text-base font-medium [color:inherit]',
  h5: 'text-sm font-medium [color:inherit]',
  body: 'text-sm leading-snug [color:inherit]',
  caption: 'text-xs text-muted-foreground',
}

export const Text = createComponentImplementation(TextApi, ({ props }) => {
  const variant = (props.variant ?? 'body') as keyof typeof variantClasses
  const text = stripMarkdownHeading(String(props.text ?? ''))
  const className = cn(variantClasses[variant])

  switch (variant) {
    case 'h1':
      return <h1 className={className}>{text}</h1>
    case 'h2':
      return <h2 className={className}>{text}</h2>
    case 'h3':
      return <h3 className={className}>{text}</h3>
    case 'h4':
      return <h4 className={className}>{text}</h4>
    case 'h5':
      return <h5 className={className}>{text}</h5>
    case 'caption':
      return <span className={className}>{text}</span>
    default:
      return <p className={className}>{text}</p>
  }
})
