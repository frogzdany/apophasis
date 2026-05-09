import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
// A2UI v0.9 structural CSS — wires up markdown rendering, layout spacing
// tokens, ChoicePicker labels, etc. Aliased in vite.config.ts because the
// package's exports field advertises a path that doesn't exist.
import '@a2ui-react-styles/v0_9'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
