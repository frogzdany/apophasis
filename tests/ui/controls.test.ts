import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { Controls } from '@/ui/Controls'

const startMock = vi.fn()
const stopMock = vi.fn()
const toggleMuteMock = vi.fn()

vi.mock('@/hooks/useVoiceSession', () => ({
  useVoiceSession: () => ({
    start: startMock,
    stop: stopMock,
    toggleMute: toggleMuteMock,
    error: null,
  }),
}))

vi.mock('@/ui/MicSelector', () => ({
  MicSelector: () => createElement('div', { 'data-testid': 'mic-selector' }),
}))

vi.mock('@/ui/VoiceSelector', () => ({
  VoiceSelector: () => createElement('div', { 'data-testid': 'voice-selector' }),
}))

function renderControls() {
  return render(createElement(Controls))
}

describe('Controls', () => {
  beforeEach(() => {
    startMock.mockReset()
    stopMock.mockReset()
    toggleMuteMock.mockReset()
    useStore.setState({
      phase: 'idle',
      micLevel: 0,
      micMuted: false,
      voiceActive: false,
      language: 'es',
      lite: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows only the talk control while the session is idle', () => {
    renderControls()

    expect(screen.getByRole('button', { name: 'Hablar con Lucy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mutear micrófono' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar micrófono' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hablar con Lucy' }))

    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('shows mute and stop controls while the session is active', () => {
    useStore.setState({ voiceActive: true, micMuted: false, phase: 'listening' })

    renderControls()

    expect(screen.queryByRole('button', { name: 'Hablar con Lucy' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mutear micrófono' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mutear micrófono' }))
    fireEvent.click(screen.getByRole('button', { name: 'Detener' }))

    expect(toggleMuteMock).toHaveBeenCalledTimes(1)
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('shows the unmute control when the session is active but muted', () => {
    useStore.setState({ voiceActive: true, micMuted: true, phase: 'listening' })

    renderControls()

    expect(screen.queryByRole('button', { name: 'Mutear micrófono' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activar micrófono' }))

    expect(toggleMuteMock).toHaveBeenCalledTimes(1)
  })
})
