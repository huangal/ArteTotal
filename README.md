# ArteTotal

Portfolio and shop for the oil paintings of Carlos Huangal: a gallery with a
full-screen viewer, a shop with a demo checkout, and an Artist Studio for adding
and editing paintings.

Built with React, TypeScript, Vite, Tailwind CSS v4 and Motion. A small API
(`server/`, Hono on Node's built-in SQLite) stores the collection, uploads and orders.

## Getting started

Development requires Node 24 or newer (the deployed site runs on Node 18; see below).

```bash
npm install
npm run dev
```

This starts the API on port 3001 and the site on http://localhost:5173.
The database is created and seeded on first run in `server/data/` (not committed);
delete that folder to reset to the original collection.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm start` | Run the API, which also serves `dist/` once built |
| `npm test` | API tests |
| `npm run lint` | Lint with oxlint |

## Deploying

The host runs Node 18, which can't build the site or run the TypeScript server, so the
`release` branch holds a ready-to-run build instead of source:

```bash
npm run release -- --push
```

This builds the site, compiles the API to JavaScript and pushes the result to `release`.

Or let GitHub build it: push a version tag and the **Release** workflow
(`.github/workflows/release.yml`) lints, tests, builds, updates `release` and creates
a GitHub Release with the package as a ZIP:

```bash
git tag v1.0.0
git push origin v1.0.0
```

It can also be run by hand from the Actions tab to update `release` without a GitHub Release.
Hosting setup (Windows/IIS with iisnode, Node 18) is in `deploy/README.md`, which is also the
README of the `release` branch. The package needs no `npm install` on the host.

## Notes

- Checkout records the order and marks paintings sold, but takes no payment.
- The API has no authentication yet: anyone who can reach it can change the
  collection. Add authentication before deploying it publicly.
- Painting images live in `public/art/`; API details are in `server/README.md`.
