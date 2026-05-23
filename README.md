# r/Fantasy 2026 Bingo

A planning and tracking tool for the [r/Fantasy 2026 Book Bingo Challenge](https://www.reddit.com/r/Fantasy/). Click a square, search for a book, mark it as read, and share your filled-in card as an image.

**Live**: [rfantasy-bingo-2026.pages.dev](https://rfantasy-bingo-2026.pages.dev)

## Features

- **Browse and assign books** to any of the 25 bingo squares
- **Search** via Open Library + Google Books, with cover art from both sources
- **Track progress** — planned vs. read, hard mode completions, star ratings
- **Bingo detection** — rows, columns, and diagonals counted automatically
- **Author conflict warnings** — flags when the same author is assigned to multiple squares (with Duology exception)
- **Share card** — download a PNG of your filled card for posting
- **Backup / restore** — export and import all your data as JSON
- **Offline-friendly** — everything stored in `localStorage`

## Architecture

The whole app is **one HTML file** (~2000 lines, no build step) plus a small Cloudflare Worker that proxies the Google Books API.

```
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ Cloudflare Pages │ ─→ │  Cloudflare Worker  │ ─→ │ Google Books API │
│   (index.html)   │    │   (key hidden in    │    │  (key required)  │
│                  │    │     env vars)       │    │                  │
│                  │    │                     │    └──────────────────┘
│                  │ ─→ │  Same Worker also   │ ─→ ┌──────────────────┐
│                  │    │  proxies covers     │    │  Open Library /  │
│                  │    │   (CORS + placeholder │    │  Google Books    │
│                  │    │  detection)         │    │   cover hosts    │
└──────────────────┘    └─────────────────────┘    └──────────────────┘
```

### Notable design choices

- **No framework, no build step** — single static HTML file. Drag-and-drop deploy. Fits a small project.
- **API key hidden in a Worker** — Google Books API key lives in Cloudflare environment variables, never reaches the browser.
- **Placeholder cover detection** — Google Books returns an "Image not available" image for books without covers. The Worker fetches a known-coverless book's placeholder once, hashes it, and compares all future cover responses. Books with real covers come through; placeholders trigger a 📚 fallback.
- **localStorage schema versioning** — pool and assignment data have a `version` field; migrations run on app load. Corrupted data is preserved for manual recovery instead of silently wiped.
- **Search cache in localStorage** — 7-day TTL, FIFO eviction at 100 entries. Reduces Google Books quota burn across sessions.
- **CORS-safe cover proxy** — covers are proxied through the Worker with proper headers so the canvas-based share card export isn't tainted.

## Tech stack

- HTML / CSS / vanilla JS — no dependencies, no build
- Cloudflare Worker — proxies Google Books, hides API key, detects placeholder covers
- Cloudflare Pages — static hosting + auto-deploy on `git push`
- Google Books API + Open Library API — book metadata and cover art

## Local development

```bash
git clone https://github.com/Amruta-Ranade/rfantasy-bingo.git
cd rfantasy-bingo
# Open index.html in your browser. That's it.
```

To test against the Worker, the page must be served from an origin listed in the Worker's `ALLOWED_ORIGINS` (currently the Pages URL). Local file access (`file://`) won't pass CORS — use a deployed branch or a local static server with a matching origin override.

## Worker deployment

`worker.js` is the source of truth. To deploy:

1. Open the Cloudflare Worker editor for the `rfantasy-bingo-proxy` Worker.
2. Paste the contents of `worker.js`.
3. Click **Deploy**.

The Google Books API key is stored as an encrypted environment variable named `GB_KEY`.

## License

MIT — see [LICENSE](./LICENSE).
