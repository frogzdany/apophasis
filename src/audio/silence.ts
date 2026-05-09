export function createSilentPcmChunk(source: ArrayBuffer): ArrayBuffer {
  return new ArrayBuffer(source.byteLength)
}
