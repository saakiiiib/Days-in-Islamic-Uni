# GTA Islamic University

**[Play Live on GitHub Pages](https://saakiiiib.github.io/gta-islamic-university/)**

A playable 3D browser exploration game built with **Three.js** and **Vite** from OpenStreetMap data for **Islamic University, Kushtia, Bangladesh**. Explore the campus on foot or by vehicle on desktop and mobile browsers — no install, backend, or paid APIs required.

## Highlights

- **Real OSM Campus Layout:** Trimmed to the Islamic University campus perimeter (**57 buildings, 40 roads/paths, and 3 separate water features**) with Main Gate exterior spawn, landmark massing (Central Mosque, academic blocks, auditorium, residential halls), and perimeter containment.
- **Playable Characters & Campus Life:** Choose between **Hujur** and **Niqab** student characters, encounter circulating campus pedestrians with recorded Bangla voice reactions, and use bilingual English/Bangla place search (including current and historical campus names).
- **Drivable Vehicles & Services:**
  - **8 electric cargo vans** (3 circulating automatically, 5 parked at campus hubs; Shift speed boost).
  - **Red Double Decker Bus (লাল বাস)** — drivable campus shuttle.
  - **IU Ambulance** — automated emergency response vehicle.
- **Desktop & Mobile Ready:** Full keyboard + mouse/pointer-lock controls on desktop and automatic virtual joystick + swipe camera + touch buttons on phones/tablets, plus selectable sky lighting presets.

## Quick Start

Requires **Node.js 22.12+** (or Node 24 LTS).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (default `http://127.0.0.1:5173/`).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Prepare campus data and start Vite dev server |
| `npm run build` | Prepare campus data and build production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the full `node:test` suite (**322 tests**) |
| `npm run prepare:campus` | Regenerate `src/generated/campus-prepared.json` from `public/data/map.osm` |

## Controls

### Desktop — On Foot

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `Mouse` / `Right-drag` / `Arrow keys` | Look / orbit camera |
| `E` | Enter nearby electric van or Red Bus |
| `R` | Return to Main Gate and reset campus fleet/activity |
| `M` | Mute / unmute recorded Bangla reactions |
| `L` | Toggle nearby place labels |
| `I` | Toggle paused campus inspection camera |
| `G` | Toggle OSM road/building alignment overlay |
| `F3` | Toggle performance & actor diagnostics |
| `Escape` | Pause / resume |

### Desktop — Driving

| Input | Action |
| --- | --- |
| `W` / `S` | Accelerate / brake & reverse |
| `A` / `D` | Steer |
| `Shift` | Speed boost |
| `Space` (hold) | Hard brake |
| `H` | Vehicle horn |
| `E` | Jump out / exit vehicle |

### Mobile & Tablet

Phones and tablets automatically show a left movement/steering joystick, swipe-to-look camera area on the right, and context-sensitive buttons for jump, sprint, horn, enter/exit, brake, and pause. Landscape orientation is recommended.

## Project Structure

```text
gta-islamic-university/
├── .github/workflows/     # PR test/build checks & GitHub Pages deployment
├── docs/                  # Campus realism research, landmark evidence & deployment guide
├── public/
│   ├── audio/             # Recorded Bangla NPC reactions & metadata
│   ├── data/              # OpenStreetMap extract (map.osm) & ODbL notice
│   └── visual/            # CC0 WebP textures, bench model & checksummed manifest
├── references/campus/     # Wikimedia Commons reference attribution manifest
├── scripts/               # Campus data preparation, asset pipeline & QA scripts
├── src/
│   ├── activity/          # Campus traffic & pedestrian activity
│   ├── assets/            # Landing artwork & character portraits
│   ├── audio/             # Web Audio playback & horn synthesis
│   ├── data/              # Campus landmark, alias, height & surface registries
│   ├── game/              # Core game loop & session state
│   ├── generated/         # Prepared campus geometry cache
│   ├── loading/           # Startup asset loader
│   ├── map/               # OSM XML parser, campus trimmer & geometry builder
│   ├── navigation/        # Road corridors, minimap & place search
│   ├── npc/               # Pedestrian actors & avoidance
│   ├── platform/          # Touch/mobile input & device detection
│   ├── player/            # Character controllers, animation & collisions
│   ├── ui/                # HUD, sky controls, labels & search UI
│   ├── vehicle/           # Electric vans, Red Double Decker Bus & IU Ambulance
│   └── world/             # Buildings, landmarks, water, vegetation & lighting
└── tests/                 # Native node:test suites (322 tests)
```

## Documentation, Credits & License

- **Deployment & Hosting:** [docs/deployment.md](docs/deployment.md)
- **Campus Realism & Research Notes:** [docs/campus-realism.md](docs/campus-realism.md) & [docs/realism-implementation-status.md](docs/realism-implementation-status.md)
- **OpenStreetMap Data Credits (ODbL 1.0):** [DATA-CREDITS.md](DATA-CREDITS.md)
- **Third-Party Notices (CC0 Assets & Runtime Deps):** [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- **Source Code License:** [MIT](LICENSE)
