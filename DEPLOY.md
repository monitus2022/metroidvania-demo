# Deploying the demo

The build is a static bundle: one `index.html`, one content-hashed JS asset, and
`_headers`. No server, no runtime data fetching — `content/*.json` is compiled
into the bundle at build time. That means any static host works.

## Cloudflare Pages — Git integration (recommended)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick `monitus2022/metroidvania-demo` and authorise.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | `NODE_VERSION` (environment variable) | `24` |

   `NODE_VERSION` matters: Vite 8 requires Node `^20.19 || >=22.12`, and Pages'
   default image has been on Node 22. Pin it rather than relying on the default.

4. **Production branch.** Pages builds one branch as production and every other
   branch as a preview with its own `*.pages.dev` URL. Set it to whichever branch
   should be public:
   - `dev` → the demo tracks active development (what this repo does today);
   - `main` → the demo only updates on merge, and `dev` gets preview URLs.

Do **not** point the build command at `npm test`: the Playwright e2e layer needs
a browser and a preview server that the Pages build image does not provide.

## Cloudflare Pages — CLI

```sh
npm run build
npx wrangler pages deploy dist --project-name metroidvania-demo
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.
`wrangler.toml` already sets the project name and output directory.

## Verifying a deploy

The e2e suite already asserts the properties that matter for hosting: the built
bundle boots in a real browser, advances the simulation unattended, and responds
to real key events. After deploying, the same assertions can be pointed at the
live URL:

```sh
npx playwright test --config playwright.config.ts   # local, against vite preview
```

For a one-off check of a live URL, any headless browser loading the page and
reading `window.__game.ready` is enough.

## What breaks a static deploy

- **Absolute asset paths.** Handled: `base: './'` in `vite.config.ts`, so the
  bundle also works from a subpath. Verified by serving `dist/` from
  `/some/deep/path/`.
- **Caching `index.html`.** Handled: `public/_headers` sets the HTML to
  revalidate and the hashed asset to immutable.
- **Node version drift.** Handled: `.nvmrc` plus `NODE_VERSION=24`.

## Known state of the demo

The simulation does not implement the double jump yet, so the shipped 3-room
level is **not completable end to end**. The solver proves it would be beatable
once that ability exists. Shipping before M3 gives the public a movement
tech-demo rather than a finishable game — a deliberate choice, not an oversight.
