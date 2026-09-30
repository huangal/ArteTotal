# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ArteTotal is a single-page portfolio and shop for a painter, built with React + TypeScript on Vite, styled with Tailwind v4 and animated with Motion (`motion/react`). The collection, Studio uploads and orders are stored by a small API (`server/`, Hono on Node's built-in SQLite). The cart stays in client state and resets on reload.

## Commands

- `npm run dev` — start the API (`dev:api`, port 3001, restarts on change) and the Vite dev server (`dev:web`, proxies `/api` and `/uploads` to the API)
- `npm run build` — type-check app, Vite config and server via `tsc -b`, then production-build with Vite
- `npm start` — run the API; once `dist/` is built it also serves the site
- `npm test` — API tests with Node's test runner (`server/*.test.ts`); run one with `node --test --test-name-pattern "<name>" server/app.test.ts`
- `npm run lint` — lint with oxlint (config: `.oxlintrc.json`)
- `npm run preview` — serve the production build locally (needs the API running)

Requires Node 24+: the server runs its TypeScript directly (type stripping) and uses `node:sqlite`, so it has no build step.

## Architecture

- Entry point: `src/main.tsx` mounts `<App />` from `src/App.tsx` into `index.html`.
- Vite config: `vite.config.ts` (uses `@vitejs/plugin-react`).
- TypeScript project is split into `tsconfig.app.json` (app/browser code), `tsconfig.node.json` (Vite config itself) and `tsconfig.server.json` (API), referenced from the root `tsconfig.json`. Server imports use explicit `.ts` extensions and only erasable syntax, since Node runs them as-is.
- Static assets served as-is go in `public/`; assets imported by code go in `src/assets/`.
- API (`server/`): `index.ts` boots the server, `app.ts` has the routes and validation, `db.ts` is the SQLite repository (schema, seeding, order transaction). Data lives in `server/data/` (gitignored; `DATA_DIR` overrides): `artetotal.db` plus `uploads/` for Studio images, served at `/uploads/*`. Delete the folder to reset to the seed. Endpoints are listed in `server/README.md`.
- Types shared by UI and API: `src/types.ts`. Statuses are `available`, `reserved`, `sold` (`sold` is shown as "In Private Collection").
- State: `src/state/StoreProvider.tsx` (reducer for artworks + cart, plus overlay/theme/toast UI state), read via `useStore()` from `src/state/store.ts`. It loads the collection on mount and its create/update/remove/purchase actions call the API through `src/lib/api.ts` before updating local state; failures throw `ApiError`.
- Seed collection: `server/seed.ts`, inserted when the database is empty. Seed painting images go in `public/art/` (see its README); an entry may set a `fallback` image used when its file is missing.
- Sections in `src/components/`: `Nav`, `Hero`, `Gallery`, `Shop`, `About`, `Footer`. Overlays: `ArtworkModal` (includes editing and removing a painting), `CartDrawer` (checkout records an order and marks works sold; no payment is taken), `Studio` (drag-and-drop form that adds a painting, or edits one when opened with `openStudio(id)`; it opens over the modal).
- Theming: color tokens are CSS variables in `src/index.css`, mapped to Tailwind colors (`paper`, `wall`, `ink`, `ink-2`, `ink-3`, `line`, `accent`, `danger`). Follows the OS theme; the nav toggle sets `data-theme` on `<html>` and persists it in localStorage. Use these tokens, not Tailwind `dark:` variants.
