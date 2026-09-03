# UNIT3D Scripts

A collection of userscripts for UNIT3D-based private trackers. Enhances the browsing, uploading, and social experience with quality-of-life improvements.

## Installation

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox) or [Violentmonkey](https://violentmonkey.github.io/) (Chrome/Firefox)
2. Click on any script's raw link below
3. Your userscript manager will prompt you to install

## Scripts

### Add Ratings
> **v1.5.3** — Matched on: `/torrents/*`, `/requests/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/add-ratings.user.js)

Adds Letterboxd, IMDb, Rotten Tomatoes, and Metacritic ratings to torrent pages. Fetches data via the OMDb API with local caching (configurable expiry). Displays an aggregate weighted score across all sources.

---

### Bot Hider
> **v1.3.3** — Matched on: `/chatbox*`, `/chat/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bot-hider.user.js)

Hides bot messages in the chatbox. Supports filtering by username or custom regex patterns. Configurable bot list, filter modes (show/hide), and a toggle panel. Uses MutationObserver for dynamic messages.

---

### Encode Type
> **v2.4.0** — Matched on: `/torrents/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/encode-type.user.js)

Full mediainfo analysis panel on torrent detail pages. Parses video (AVC, HEVC, AV1, VP9, VP8 — codec, bitrate, resolution, HDR, frame rate, scan type, color space) and audio (format, channels, bitrate, language) streams. Shows:

- Encode compatibility checks (including AV1/VP9 hardware decode)
- Quality score (0-100) based on bitrate efficiency, encoder, preset, rate control, B-frames, and source quality
- Exportable analysis report

---

### Giveaway
> **v6.5.3** — Matched on: `/chatbox*`, `/chat/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/giveaway.user.js)

Complete BON giveaway system via chat commands. Features:

- Commands: `!host`, `!entry`, `!free`, `!lucky`, `!random`, `!range`, `!history`
- Chat spam detection with cooldowns, strike system, and exponential backoff
- Multi-winner support (up to 50)
- Sponsor announcement modes (immediate/digest/off)
- Persistent statistics per tracker
- Scheduled giveaways with time-based triggers

---

### Keybinds
> **v1.5.1** — Matched on: `/torrents*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/keybinds.user.js)

Keyboard shortcuts for torrent pages with modifier key support (Ctrl/Shift/Alt):

| Key | Action |
|-----|--------|
| `S` | Open IMDb |
| `L` | Open Letterboxd |
| `M` | Open TMDB |
| `X` | Open Blu-ray.com |
| `T` | Open Trailer |
| `E` | Edit torrent |
| `J`/`K` | Navigate list up/down |
| `Enter` | Open selected |
| `/` | Focus search |
| `?` | Show help |

All keybinds are customizable via the settings panel with modifier key support. Press `Escape` to close overlays.

---

### Table Sorting
> **v1.3.2** — Matched on: `/torrents`, `/torrents/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/table-sorting.user.js)

Client-side column sorting on torrent listing tables. Sortable columns: Type, Name, Size, Age, Seeders, Leechers, Completed.

- Shift+Click for secondary sort
- Proper file size parsing (KB/MB/GB/TB, including KiB/MiB/GiB/TiB)
- Date parsing via `<time>` elements
- Quick filter input
- Sort preferences persist via localStorage

---

### Torrent Highlighter
> **v1.4.2** — Matched on: `/torrents/*`, `/torrents/similar/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/torrent-highlighter.user.js)

Color-coded row highlighting based on torrent attributes:

| Highlight | Default Color |
|-----------|---------------|
| Internal | Purple |
| Freeleech | Green |
| Double Upload | Blue |
| High Speed | Orange |
| Low Seeders | Red |
| You're Seeding | Teal |
| Language Flags | Auto |
| Highlighted Uploaders | Configurable |
| Your Uploads | Configurable |

Features language flags (50+ languages), per-user/uploader highlighting, and self-upload detection. All colors and toggles are configurable via the settings panel.

---

### UNIT3D Plus
> **v1.2.2** — Matched on: `/torrents*`, `/upload*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/unit3d-plus.user.js)

Tracks changes to your user stats across page loads. Displays color-coded deltas for: upload, download, ratio, buffer, BON, and tokens (warnings was removed in UNIT3D v8). Includes:

- SVG sparkline charts showing stat trends (last 30 snapshots)
- Avatar cache-buster (opt-in via `localStorage.setItem('u3d_avatar_cache_bust', 'true')`)
- Green = positive change, red = negative (inverted for warnings)

---

### Forum Bookmarks
> **v1.0.2** — Matched on: `/forums/*`, `/forum/*`

[![Install](https://img.shields.io/badge/Install-%E2%AC%87%EF%B8%8F-blue)](https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/forum-bookmarks.user.js)

Bookmark and manage forum posts on UNIT3D sites. Features:

- Bookmark button on forum posts
- Bookmarks panel with search, sort (newest/oldest/title)
- Export/import bookmarks as JSON
- Clear all bookmarks option
- Up to 200 bookmarks stored in localStorage

---

## Compatibility

Tested on UNIT3D v7.x+ sites. Works on any site using the UNIT3D tracker software with matching URL patterns.

## License

MIT
