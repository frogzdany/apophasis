// One zero-filled buffer per byte-length. The recorder worklet only ever
// emits a single chunk size (2048 samples × 2 bytes = 4096 bytes), so in
// practice this map holds one entry for the lifetime of a session. Sharing
// the buffer is safe because nothing downstream mutates it — the SDK
// base64-encodes the data and ships it over the wire.
const SILENT_BUFFERS = new Map<number, ArrayBuffer>()

export function createSilentPcmChunk(source: ArrayBuffer): ArrayBuffer {
  const len = source.byteLength
  let cached = SILENT_BUFFERS.get(len)
  if (!cached) {
    cached = new ArrayBuffer(len)
    SILENT_BUFFERS.set(len, cached)
  }
  return cached
}
