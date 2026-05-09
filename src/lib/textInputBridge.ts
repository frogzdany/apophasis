// Module-scoped singleton so the LeftSidebar text input can call into the
// active LiveSession owned by useVoiceSession (which lives in Controls).
//
// Mirrors the pattern in src/a2ui/processor.ts (setActionListener):
// the owner registers its handler once on mount, any consumer can pull it.
// React context would also work; this is simpler given there is exactly
// one session per page.

export type TextSubmitter = (text: string) => Promise<void>

let submitter: TextSubmitter | null = null

export function setTextSubmitter(fn: TextSubmitter | null): void {
  submitter = fn
}

export function getTextSubmitter(): TextSubmitter | null {
  return submitter
}
