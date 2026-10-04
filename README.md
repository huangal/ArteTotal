# ArteTotal

Portfolio and shop for the oil paintings of Carlos Huangal: a gallery with a
full-screen viewer, a shop with a demo checkout, and an Artist Studio for adding
and editing paintings.

Built with React, TypeScript, Vite, Tailwind CSS v4 and Motion. A small API
(`server/`, Hono) stores the collection and orders in Microsoft SQL Server; uploaded images
are kept on disk.

## Getting started

Development requires Node 24 or newer (the deployed site runs on Node 18; see below).

1. Copy `deploy/artetotal.settings.example.json` to `artetotal.settings.json` in the project
   folder (it's ignored by Git) and fill in the SQL Server details, its password and a
   Studio password.
2. Check the connection, then start:

```bash
npm install
npm run db:check
npm run dev
```

This starts the API on port 3001 and the site on http://localhost:5173. On first start the API
creates its tables and loads the original paintings. Note that development uses whichever
database the settings name: if that's the live one, changes made locally appear on the site.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm start` | Run the API, which also serves `dist/` once built |
| `npm test` | API tests (need a SQL Server they may create a test database on: set `TEST_DB_SERVER`, `TEST_DB_USER`, `TEST_DB_PASSWORD`; GitHub provides one) |
| `npm run db:check` | Test the SQL Server connection, without changing anything |
| `npm run db:migrate` | Copy paintings and orders from the old SQLite database (`-- --yes` to apply) |
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
- Painting images live in `public/art/`; API details are in `server/README.md`.
