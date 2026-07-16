# MemoryMap AI

**A memory for your things.** Photograph an item the moment you store it — MemoryMap AI reads the photo, remembers the room and what's nearby, and finds it again the instant you ask.

> Built as a national-level exhibition project (Class 11).

## Problem statement

People forget where they kept important items — passports, chargers, keys, jewellery, documents. MemoryMap AI turns a quick photo into a searchable memory, so "where did I put my passport?" gets answered in one sentence instead of a room-by-room search.

## How it works

1. **Snap** — photograph an item as you put it away, straight from your phone camera.
2. **Store** — Claude's vision model looks at the photo and writes a short description of the item and its surroundings (shelf, nearby objects), tagged with the room and timestamp.
3. **Search** — type a question like "where is my passport?" and Claude matches it against everything stored, replying in one natural sentence.

## Tech stack

- Plain HTML, CSS, and JavaScript — no build step, no framework, so it's easy to read and easy to grade.
- [Anthropic Claude API](https://docs.claude.com) (`claude-sonnet-5`) for both image understanding and natural-language search, called directly from the browser.
- `localStorage` for on-device persistence — every stored item stays on the phone or laptop that added it.

## Running it

### Option A — GitHub Pages (recommended for judging)

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**, set the source to the `main` branch (root), and save.
3. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/` — open it on your phone.

### Option B — run locally

Just open `index.html` in a browser, or serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Connecting the AI

MemoryMap AI needs an Anthropic API key to actually read photos and answer searches:

1. Create a free key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. On the site, tap **API key** in the top-right nav and paste it in.
3. The key is saved only in your browser's local storage — it never leaves your device except in direct calls to Anthropic's API.

**Important for the demo:** this calls the API directly from the browser, which is fine for a personal or classroom demo but means the key is visible in the browser's network requests. Don't publish a key you care about, and don't commit a key to the repository. For a production version, the right next step is a small backend that holds the key server-side (see Future Work).

## Mobile use

The photo input uses `capture="environment"`, so on a phone, tapping "Store an item" opens the rear camera directly instead of a file picker — no extra app needed.

## Project structure

```
memorymap-ai/
├── index.html      — page structure and content
├── style.css        — the corkboard / evidence-board design system
├── script.js         — storage, image handling, and Claude API calls
└── README.md
```

## Future work

- Move the API key server-side so it's never exposed in the browser.
- Sync storage across devices (e.g. Firebase or Supabase) instead of per-device `localStorage`.
- Let users correct a wrong AI caption by editing it directly.
- Support voice search for hands-free lookups.
