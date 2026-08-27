# UNIT3D Scripts

A collection of userscripts for UNIT3D-based private trackers. Enhances the browsing, uploading, and social experience with quality-of-life improvements.

## Installation

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox) or [Violentmonkey](https://violentmonkey.github.io/) (Chrome/Firefox)
2. Click on any script's raw link below
3. Your userscript manager will prompt you to install

## Scripts

### Add Ratings
> **v1.5** — Matched on: `/torrents/*`, `/torrents/similar/*`, `/requests/*`

Adds Letterboxd, IMDb, Rotten Tomatoes, and Metacritic ratings to torrent pages. Fetches data via the OMDb API with local caching (configurable expiry). Displays an aggregate weighted score across all sources.

---

### Bot Hider
> **v1.3** — Matched on: `/chatbox*`, `/chat/*`

Hides bot messages in the chatbox. Supports filtering by username or custom regex patterns. Configurable bot list, filter modes (show/hide), and a toggle panel. Uses MutationObserver for dynamic messages.

---

### Encode Type
> **v2.2** — Matched on: `/torrents/*`

Full mediainfo analysis panel on torrent detail pages. Parses video (codec, bitrate, resolution, HDR, frame rate, scan type, color space) and audio (format, channels, bitrate, language) streams. Shows:

- Encode compatibility checks
- Quality score (0-100) based on bitrate efficiency, encoder, preset, rate control, B-frames, and source quality
- Exportable analysis report

---

### Giveaway
> **v6.5.0** — Matched on: all pages

Complete BON giveaway system via chat commands. Features:

- Commands: `!host`, `!entry`, `!free`, `!lucky`, `!random`, `!range`, `!history`
- Chat spam detection with cooldowns, strike system, and exponential backoff
- Multi-winner support (up to 50)
- Sponsor announcement modes (immediate/digest/off)
- Persistent statistics per tracker
- Scheduled giveaways with time-based triggers

---

### Keybinds
> **v1.4** — Matched on: `/torrents*`

Keyboard shortcuts for torrent pages:

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

All keybinds are customizable via the settings panel. Press `Escape` to close overlays.

---

### Table Sorting
> **v1.3** — Matched on: `/torrents`, `/torrents/*`

Client-side column sorting on torrent listing tables. Sortable columns: Type, Name, Size, Age, Seeders, Leechers, Completed.

- Shift+Click for secondary sort
- Proper file size parsing (KB/MB/GB/TB, including KiB/MiB/GiB/TiB)
- Date parsing via `<time>` elements
- Quick filter input
- Sort preferences persist via localStorage

---

### Torrent Highlighter
> **v1.3** — Matched on: `/torrents/*`, `/torrents/similar/*`

Color-coded row highlighting based on torrent attributes:

| Highlight | Default Color |
|-----------|---------------|
| Internal | Purple |
| Freeleech | Green |
| Double Upload | Blue |
| High Speed | Orange |
| Low Seeders | Red |
| You're Seeding | Teal |

All colors and toggles are configurable via the settings panel. Configurable min seeder threshold (default: 3).

---

### UNIT3D Plus
> **v1.1** — Matched on: `/torrents*`, `/upload*`

Tracks changes to your user stats across page loads. Displays color-coded deltas for: upload, download, ratio, buffer, warnings, BON, and tokens. Green = positive change, red = negative (inverted for warnings).

---

## Compatibility

Tested on UNIT3D v7.x+ sites. Works on any site using the UNIT3D tracker software with matching URL patterns.

## License

MIT
