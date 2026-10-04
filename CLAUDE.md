# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ArteTotal is a single-page portfolio and shop for a painter, built with React + TypeScript on Vite, styled with Tailwind v4 and animated with Motion (`motion/react`). A small API (`server/`, Hono) stores the collection and orders in Microsoft SQL Server (`mssql` driver, SQL login); Studio image uploads stay on disk. The cart stays in client state and resets on reload.

## Commands

- `npm run dev` — start the API (`dev:api`, port 3001, restarts on change) and the Vite dev server (`dev:web`, proxies `/api` and `/uploads` to the API)
- `npm run build` — type-check app, Vite config and server via `tsc -b`, then production-build with Vite
- `npm start` — run the API; once `dist/` is built it also serves the site
- `npm run build:server` — compile the API to JavaScript in `build/` (`tsconfig.server.build.json`)
- `npm run package` — build the Node 18 deploy package into `.release/` (server bundled into one file with Vite's SSR build, including the SQL Server driver; `app.cjs`, `web.config` and `artetotal.settings.example.json` copied from `deploy/`; `app.cjs` serves an explanatory error page if the server fails to start); `npm run release` also commits it to the `release` branch (`npm run release -- --push` pushes it). Needs a clean working tree. See `scripts/release.mjs` and `deploy/README.md`
- CI: `.github/workflows/test.yml` runs lint, build and the tests (Node 24 and Node 18) against a SQL Server 2022 service container on every push and PR. `.github/workflows/release.yml` runs the same tests and `scripts/release.mjs --commit --push` on GitHub when a `v*` tag is pushed (also creates a GitHub Release with the package ZIP), or by hand via workflow_dispatch
- `npm test` — API tests with Node's test runner (`server/*.test.ts`) against SQL Server: they create and drop their own database on the server named by `TEST_DB_SERVER`, `TEST_DB_USER`, `TEST_DB_PASSWORD` (`TEST_DB_PORT`), and skip if unset; they never read the settings file. Run one with `node --test --test-name-pattern "<name>" server/app.test.ts`
- `npm run db:check` — read-only connection check (server version, CREATE TABLE permission, table row counts); `npm run db:migrate` copies paintings and orders from the old SQLite `server/data/artetotal.db` (preview; `-- --yes` applies)
- `npm run lint` — lint with oxlint (config: `.oxlintrc.json`)
- `npm run preview` — serve the production build locally (needs the API running)

Development requires Node 24+: the server runs its TypeScript directly (type stripping). Settings (SQL Server connection, Studio password, optional `dataDir`) come from `artetotal.settings.json` in the project root (gitignored; template in `deploy/`) or env vars, see `server/config.ts`. Development points at whatever database the settings name, which may be the live one.

The production host is Windows/IIS with iisnode on Node 18.20.4, so server code must stay Node 18-compatible: no `import.meta.dirname`, no global `File` (check uploads as `Blob`), no Node 20+ APIs, and `@hono/node-server` stays on 1.x. iisnode passes a named pipe path (not a number) in `PORT`. The SQL Server driver is `mssql` 12 with `tedious` pinned to 19.x (package.json `overrides`), the last line supporting Node 18; its Azure dependencies declare Node 22 but are only used for Entra ID logins and load fine on Node 18. Vite 8 needs Node 20+, so the site is built before deploying and the `release` branch holds the built output, not source. `npm run build:server && node --test build/server/` runs the API tests as JavaScript, e.g. on Node 18 (CI does this).

## Architecture

- Entry point: `src/main.tsx` mounts `<App />` from `src/App.tsx` into `index.html`.
- Vite config: `vite.config.ts` (uses `@vitejs/plugin-react`).
- TypeScript project is split into `tsconfig.app.json` (app/browser code), `tsconfig.node.json` (Vite config itself) and `tsconfig.server.json` (API), referenced from the root `tsconfig.json`. Server imports use explicit `.ts` extensions and only erasable syntax, since Node runs them as-is.
- Static assets served as-is go in `public/`; assets imported by code go in `src/assets/`.
- API (`server/`): `index.ts` boots the server, `config.ts` loads settings, `auth.ts` is the Studio login (one password, signed HttpOnly cookie, lockout after repeated wrong passwords), `app.ts` has the routes and validation (public: browse, order; Studio: change paintings, list orders, change order status), `db.ts` is the SQL Server repository (creates tables if missing, seeds an empty collection, locked order transaction, order status changes; cancelling returns paintings to available). Uploaded images live in `server/data/uploads/` (gitignored; `dataDir`/`DATA_DIR` overrides), served at `/uploads/*`. Endpoints are listed in `server/README.md`.
- Types shared by UI and API: `src/types.ts` (the server imports its runtime constants too, so keep it erasable syntax). Painting statuses are `available`, `reserved`, `sold` (`sold` is shown as "In Private Collection"); order statuses are `new` → `paid` → `shipped`, or `cancelled` (`ORDER_STATUS_NEXT`).
- State: `src/state/StoreProvider.tsx` (reducer for artworks + cart, plus overlay/theme/toast UI state), read via `useStore()` from `src/state/store.ts`. It loads the collection on mount and its create/update/remove/purchase actions call the API through `src/lib/api.ts` before updating local state; failures throw `ApiError`.
- Seed collection: `server/seed.ts`, inserted when the database is empty. Seed painting images go in `public/art/` (see its README); an entry may set a `fallback` image used when its file is missing.
- Sections in `src/components/`: `Nav`, `Hero`, `Gallery`, `Shop`, `About`, `Footer`. Overlays: `ArtworkModal` (editing and removing a painting, shown only when signed in to the Studio), `CartDrawer` (checkout records an order and marks works sold; no payment is taken), `Studio` (sign-in via `StudioSignIn`, then tabs: the drag-and-drop form that adds a painting, or edits one when opened with `openStudio(id)`, and `StudioOrders`; it opens over the modal). The store's `studioSession` ('checking' | 'signed-out' | 'signed-in' | 'locked') is checked on load; Studio requests that return 401 sign the browser out.
- Theming: color tokens are CSS variables in `src/index.css`, mapped to Tailwind colors (`paper`, `wall`, `ink`, `ink-2`, `ink-3`, `line`, `accent`, `danger`). Follows the OS theme; the nav toggle sets `data-theme` on `<html>` and persists it in localStorage. Use these tokens, not Tailwind `dark:` variants.
