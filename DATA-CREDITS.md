# Map Data Credits and License

**© OpenStreetMap contributors**

- Attribution and copyright: https://www.openstreetmap.org/copyright
- Data license: Open Data Commons Open Database License 1.0 (ODbL): https://opendatacommons.org/licenses/odbl/1-0/
- Bundled source file: `public/data/map.osm` (770,269 bytes, export covering Islamic University, Kushtia, Bangladesh).

The OpenStreetMap database is licensed under ODbL 1.0. The generated campus geometry derives from this extract, and all OSM attribution and data rights are retained. Application source code (`LICENSE`), procedural character/vehicle geometry, and illustrative materials are separate from the OSM data license. No Google Maps imagery, paid map API, or runtime tile requests are used.

## Source Extract vs. Trimmed Campus Area

- **Raw OSM snapshot (`public/data/map.osm`)**: 3,260 nodes, 482 ways, 14 relations (189 building footprints, 42 road/path ways, 16 green features, 4 water features, 1 footbridge, 1 tree point, and 1 tree row across the bounding box).
- **Trimmed playable campus**: The game clips the bounding box to the Islamic University campus perimeter, retaining **57 campus buildings, 40 road/path ways, and 3 separate water features** (excluding 132 outside buildings). Heights, widths, facades, seasonal planting, and flat terrain are documented approximations (see `docs/campus-realism.md` and `docs/height-provenance.md`).
- **Geometry repair**: Two orphan inner rings of OSM relation `18079383` are associated with their enclosing building relation `18079382` during import without altering the raw XML extract.

The production build includes `data/map.osm` and `data/NOTICE.txt`.

## Procedural Actors & Bundled Media

- **Vehicles and characters**: Electric cargo vans, the Red Double Decker Bus, IU Ambulance, and pedestrian models are original procedural Three.js geometry. Spawn routes, health, and interactions are fictional gameplay mechanics, not surveyed OSM objects.
- **Voice reactions (`public/audio/npc/`)**: Four MP3 reaction clips supplied by the repository owner (see `public/audio/README.txt`). No speech synthesis or external audio service is used.
- **Landing & character portraits (`src/assets/`)**: `campus-story-bg.webp`, `portrait-hujur.png`, and `portrait-niqab.png` are project-owned artwork bundled for the landing screen.
- **Environment textures & bench (`public/visual/`)**: CC0-1.0 assets from ambientCG and Poly Haven; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and `public/visual/manifest.json`.
