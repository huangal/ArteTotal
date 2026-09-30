# ArteTotal

Portfolio and shop for the oil paintings of Carlos Huangal: a gallery with a
full-screen viewer, a shop with a demo checkout, and an Artist Studio for adding
and editing paintings.

Built with React, TypeScript, Vite, Tailwind CSS v4 and Motion. A small API
(`server/`, Hono on Node's built-in SQLite) stores the collection, uploads and orders.

## Getting started

Requires Node 24 or newer.

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

## Notes

- Checkout records the order and marks paintings sold, but takes no payment.
- The API has no authentication yet: anyone who can reach it can change the
  collection. Add authentication before deploying it publicly.
- Painting images live in `public/art/`; API details are in `server/README.md`.
