import { describe, expect, it } from 'vitest'
import { createSilentPcmChunk } from '@/audio/silence'

describe('createSilentPcmChunk', () => {
  it('returns a zeroed buffer with the same PCM frame length', () => {
    const source = new Int16Array([1200, -800, 450, -120]).buffer

    const silent = createSilentPcmChunk(source)

    expect(silent).not.toBe(source)
    expect(silent.byteLength).toBe(source.byteLength)
    expect(Array.from(new Int16Array(silent))).toEqual([0, 0, 0, 0])
    expect(Array.from(new Int16Array(source))).toEqual([1200, -800, 450, -120])
  })
})
