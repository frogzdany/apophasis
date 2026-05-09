#!/usr/bin/env bash
# Build the Apophasis pitch deck.
#
# Reuses the marp-cli already installed in the sibling repo at
# /Users/dreyes/Documents/Freelance/codex/marp-demo so lucy-blob doesn't
# pick up a new devDependency.
#
# Usage:
#   ./build.sh           # writes presentation.html
#   ./build.sh pdf       # writes presentation.pdf
#   ./build.sh pptx      # writes presentation.pptx
#   ./build.sh watch     # live preview server
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARP="${MARP_BIN:-/Users/dreyes/Documents/Freelance/codex/marp-demo/node_modules/.bin/marp}"

if [[ ! -x "$MARP" ]]; then
  echo "marp-cli not found at $MARP" >&2
  echo "Set MARP_BIN=/path/to/marp or run \`bun install\` inside marp-demo." >&2
  exit 1
fi

SRC="$DIR/slides.md"
THEME="$DIR/themes/lucy.css"

case "${1:-html}" in
  html) "$MARP" "$SRC" --theme "$THEME" --html -o "$DIR/presentation.html" ;;
  pdf)  "$MARP" "$SRC" --theme "$THEME" --html --allow-local-files -o "$DIR/presentation.pdf" ;;
  pptx) "$MARP" "$SRC" --theme "$THEME" --html -o "$DIR/presentation.pptx" ;;
  watch) "$MARP" -w "$SRC" --theme "$THEME" --html ;;
  *) echo "unknown target: $1 (html|pdf|pptx|watch)" >&2; exit 2 ;;
esac
