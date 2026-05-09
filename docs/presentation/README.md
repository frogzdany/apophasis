# Apophasis pitch deck (Marp)

Hackathon pitch deck for the **Beyond the Chatbox 2026** brief.

## Files

| File | Purpose |
|---|---|
| `slides.md` | Marp source (the deck). Polish here. |
| `themes/lucy.css` | Custom Marp theme — dark glassy with cyan→violet accent, mirrors the in-app blob shader. |
| `build.sh` | Render to HTML / PDF / PPTX or run a live preview. |

## Building

The deck reuses the `@marp-team/marp-cli` already installed in the sibling
repo at `/Users/dreyes/Documents/Freelance/codex/marp-demo` — no new
devDependency on `lucy-blob`. Override the path with `MARP_BIN=…` if the
marp-demo folder moves.

```bash
chmod +x build.sh    # first time only

./build.sh           # presentation.html  (default)
./build.sh pdf       # presentation.pdf
./build.sh pptx      # presentation.pptx
./build.sh watch     # live preview server (open the printed URL)
```

For VS Code live editing, install the **Marp for VS Code** extension and
add `themes/lucy.css` to its `markdown.marp.themes` setting.

## Polish loop

1. Edit `slides.md` (and `themes/lucy.css` if a layout breaks).
2. `./build.sh watch` — the preview reloads on save.
3. When the content is final, render the export format the venue needs.
