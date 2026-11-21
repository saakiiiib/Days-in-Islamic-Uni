# Deployment & Hosting

- **Live game:** https://saakiiiib.github.io/gta-islamic-university/
- **Repository:** https://github.com/saakiiiib/gta-islamic-university
- **Publishing workflow:** GitHub Actions (`.github/workflows/deploy-pages.yml`)

The same URL runs on desktop browsers and mobile Android/iOS browsers with WebGL 2. Touch devices receive an on-screen joystick, swipe camera, and action buttons automatically (landscape recommended). Playing requires no install, backend, API key, or paid hosting.

## Publishing Changes

1. Run local checks:
   ```sh
   npm ci
   npm test
   npm run build
   ```
2. Open a pull request against `main` — `.github/workflows/pr-checks.yml` runs `npm ci`, `npm test`, and `npm run build` automatically.
3. Merging to `main` triggers `.github/workflows/deploy-pages.yml`, which tests, builds `dist/` (with `.nojekyll`), and deploys to GitHub Pages.

## Post-Deploy Verification

After **Deploy GitHub Pages** succeeds, verify the live build serves:
- `index.html`, hashed JS/CSS bundles, and `favicon.svg`
- `data/map.osm` (770,269 bytes, SHA-256 `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9`)
- `audio/reactions.json`, `audio/README.txt`, and the four MP3s in `audio/npc/`
- `visual/manifest.json` and the bundled WebP textures and bench binary

To roll back a broken release, revert the offending commit on `main` and let `deploy-pages.yml` redeploy the previous verified build.
