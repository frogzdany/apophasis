#!/usr/bin/env bash
# Build the Apophasis pitch deck.
#
# Resolves marp-cli in this order: $MARP_BIN env override → repo-local
# node_modules/.bin/marp (if `bun install` ran) → bunx fallback → npx
# fallback. So a fresh clone of the repo can render the deck without any
# prior setup.
#
# Usage:
#   ./build.sh           # writes presentation.html
#   ./build.sh pdf       # writes presentation.pdf
#   ./build.sh pptx      # writes presentation.pptx
#   ./build.sh watch     # live preview server
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
LOCAL_MARP="$REPO_ROOT/node_modules/.bin/marp"

if [[ -n "${MARP_BIN:-}" && -x "$MARP_BIN" ]]; then
  MARP_CMD=("$MARP_BIN")
elif [[ -x "$LOCAL_MARP" ]]; then
  MARP_CMD=("$LOCAL_MARP")
elif command -v bunx >/dev/null 2>&1; then
  MARP_CMD=(bunx --bun @marp-team/marp-cli)
elif command -v npx >/dev/null 2>&1; then
  MARP_CMD=(npx --yes @marp-team/marp-cli)
else
  echo "marp-cli not found and no bunx/npx fallback available." >&2
  echo "Run \`bun install\` at the repo root, or set MARP_BIN=/path/to/marp." >&2
  exit 1
fi

SRC="$DIR/slides.md"
THEME="$DIR/themes/lucy.css"

case "${1:-html}" in
  html) "${MARP_CMD[@]}" "$SRC" --theme "$THEME" --html -o "$DIR/presentation.html" ;;
  pdf)  "${MARP_CMD[@]}" "$SRC" --theme "$THEME" --html --allow-local-files -o "$DIR/presentation.pdf" ;;
  pptx) "${MARP_CMD[@]}" "$SRC" --theme "$THEME" --html -o "$DIR/presentation.pptx" ;;
  watch) "${MARP_CMD[@]}" -w "$SRC" --theme "$THEME" --html ;;
  *) echo "unknown target: $1 (html|pdf|pptx|watch)" >&2; exit 2 ;;
esac
