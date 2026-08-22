# Baby Sleep Tracker

Mobile-first baby sleep tracking PWA. The product name is still a working placeholder while the public brand is being selected.

## Current foundation

- Quick Fell asleep / Woke up tracking
- Live sleep and awake timers
- Manual start/end editing
- Cross-midnight sessions
- Today / yesterday sleep lists
- Swipe actions in history
- Day / week / month statistics
- Interactive 24-hour sleep timeline
- Daytime / nighttime breakdown
- JSON export / import
- PWA / iPhone home-screen usage
- HU / EN / DE interface foundation
- Device-language detection on first clean start
- Manual language selection in Settings

## Stack

- React
- Vite
- TypeScript
- Recharts
- vite-plugin-pwa
- localStorage (temporary local-first storage layer)

## Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm run build
```

## Data storage

Current clean product data key: `babySleepTracker:v3`.

Backup format: `baby-sleep-backup`, version 3.

The baby name is user data and is no longer hard-coded into the product model.

Cloudflare-based family sync is planned as the next storage/sync layer. JSON export/import remains useful as a manual backup path.

## GitHub Pages path

The repository and GitHub Pages base path still use `/botond-sleep-tracker/` temporarily so the existing test URL and installed PWA do not break before the final public product name is chosen.
