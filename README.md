# Alien — The Little Rescue Agency

A complete browser-only deduction adventure: six planets, seven authored missions per planet, and a crew of five rather distractible explorers. No build, account, API, analytics, external font, or gameplay server is required.

## Play locally

Use a static server so JavaScript modules and offline caching work:

```sh
npm start
```

Open http://127.0.0.1:8765. Alternatively serve this directory with any static web server. Deploy the directory unchanged to a static host such as GitHub Pages. Opening `index.html` directly via `file://` is unsupported because browsers restrict ES module loading.

## The campaign

| Planet         | Missions | New idea                                                        |
| -------------- | -------- | --------------------------------------------------------------- |
| Meadow Moon    | 1–7      | Exact hex distances, annotations, sector sweeps, paired rescues |
| Frost Gardens  | 8–14     | Truthful distance bands and habitat reports                     |
| Amber Dunes    | 15–21    | Six-way compass bearings and terrain evidence                   |
| Prism Marsh    | 22–28    | Paired gates that shorten signal distance                       |
| Ember Crater   | 29–35    | Independent alternating band/exact beacon channels              |
| Aurora Station | 36–42    | Combined mechanics and the expedition finale                    |

All missions have reproducible seeds, individual briefings, distinct titles, and efficiency goals. Completing a mission unlocks the next regardless of stars, hints, or assistance. Each mission awards one to three stars; gold goals are checked against an information-gain reference solver, not claimed to be globally optimal.

Free expeditions offer all six planets and all six signal styles, including the original warmer/colder mechanic. Daily expeditions rotate planets and signals using a UTC date seed. Shared campaign links open practice flights without unlocking campaign progress. Free/daily records remain separate from campaign records.

## Rules and controls

- **Scan:** choose a tile to receive the active explorer's signal. Explorers never move. Reopening the same reading is free.
- **Mark:** cycle candidate (?) → excluded (×) → clear. Annotations cost nothing and are saved with campaign missions.
- **Sweep:** test the selected tile and its six physical neighbors. Costs one action and one mission-limited sweep.
- **Portal signals:** minimum of ordinary hex distance and routes crossing gates A/B for one step. Sweeps ignore portals.
- **Pulse signals:** alternate band/exact per explorer; sweeps and duplicate readings do not advance the cycle.
- **Habitat reports:** identify the explorer's terrain. Every clue is consistent with the true location.
- **Guided overlay / hints:** label the attempt as assisted. Independent best action counts are also recorded separately.
- **Mouse/touch:** tap to act, drag to pan, pinch or wheel to zoom, Fit to recenter.
- **Keyboard:** focus the canvas, use arrow keys (Q/E for the other two diagonals), Enter/Space to act, Home to fit. Equivalent labeled tile buttons appear below the board.

Preferences include signal sounds, reduced animation, high-contrast clues, and guided elimination. System reduced-motion preferences are honored. Progress and an unfinished campaign mission save in localStorage. Settings can export/import a validated JSON backup or reset local records explicitly. If storage is unavailable, gameplay remains available and the interface recommends exporting a backup.

## Offline behavior

The scoped service worker caches the shell and all used sprites after the first successful visit on localhost or HTTPS. Network-first requests serve fresh content when online and cached content when offline. Static hosting is sufficient; the game has no backend. Increment the service-worker cache version when changing the deployed shell or asset manifest. Service workers require a secure origin (HTTPS, or localhost during development).

## Structure

- `data.js`: all 42 mission definitions, planet themes, biome assets, and crew personalities.
- `engine.js`: seeded generation, hex geometry, clues, candidate intersections, scoring, and challenges. No DOM dependencies.
- `board.js`: projected Canvas 2D island, evidence overlays, sprites, camera, unified Pointer Events, keyboard input, and one owned animation scheduler.
- `game.js`: atlas, briefings, play UI, results, journal, preferences, local progress, and shared links.
- `storage.js`: bounded versioned save validation and storage fallbacks.
- `audio.js`: small synthesized sound effects, activated by user interaction.
- `sw.js`: scoped offline shell and asset caching.

Existing character and landscape sprites in `tiles/` are preserved. Planet illustrations, hex surfaces, scanner graphics, and the app icon are rendered locally with CSS, canvas, and SVG. No runtime dependencies or external resource requests.

## Verification

```sh
npm test
```

The Node test suite covers all mission definitions and referenced assets, topology/projection round trips, deterministic generation, clue truthfulness across every campaign tile/target, portal and physical sweep separation, independent pulse phases, duplicate scans, classic equal-distance feedback, completion, validated save replay, gold-goal feasibility, tap/drag/pinch cancellation, and animation-loop ownership.

Manual browser QA should cover desktop and narrow phone layouts, live scan feedback, atlas unlocking, multi-explorer switching, reload/resume, backup import/export, and offline reload after the initial cache has installed.
