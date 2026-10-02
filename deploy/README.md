# ArteTotal deploy package

This branch is the built site, ready to run on a host with Node.js 18.17 or newer,
including cPanel's **Setup Node.js App** (Node 18.20.4). It is generated from `main`
by `npm run release`, so don't edit files here: change `main` and release again.

| Path | What it is |
| --- | --- |
| `app.cjs` | Startup file. Loads the server (Passenger needs a CommonJS entry on Node 18). |
| `server/` | The API, compiled to JavaScript. It also serves the site. |
| `dist/` | The built website, including the painting images. |
| `package.json` | Runtime dependencies only: `hono`, `@hono/node-server`, `better-sqlite3`. |

## First deploy on cPanel

1. **Create a folder for the data, outside the app**, for example `/home/USER/artetotal-data`
   (File Manager, or `mkdir ~/artetotal-data` in Terminal). The database, uploaded paintings
   and orders are stored there, so they survive redeploys.
2. **Put these files in the application folder**, for example `/home/USER/artetotal`. Either:
   - **Git (recommended):** cPanel, then *Git Version Control*, then *Create*. Clone
     `git@github.com:huangal/ArteTotal.git`, branch `release`, into that folder. A private
     repository needs a deploy key: in cPanel *SSH Access*, generate a key, then add its
     public key on GitHub under *Settings*, *Deploy keys* (read-only).
   - **Upload:** download the `release` branch as a ZIP from GitHub, upload it in
     File Manager, and extract it into that folder.
3. **Create the app:** cPanel, then *Setup Node.js App*, then *Create Application*:
   - Node.js version: **18.20.4**
   - Application mode: **Production**
   - Application root: the folder from step 2, e.g. `artetotal`
   - Application URL: your domain or a subdomain. Use the root of it (not a sub-path like `/shop`).
   - Application startup file: **`app.cjs`**
   - Environment variable: **`DATA_DIR`** = the folder from step 1, e.g. `/home/USER/artetotal-data`
4. Click **Run NPM Install**. This installs the three dependencies. `better-sqlite3` downloads
   a ready-made build for Node 18; if the host blocks that download, it compiles itself
   instead, which needs the host's build tools (ask the host if it fails).
5. Click **Restart**, then open the site. The first start creates the database and loads the
   original 20 paintings.

## Updating

1. On your computer, on `main`: `npm run release -- --push` (builds and pushes this branch).
2. On cPanel: *Git Version Control*, then *Manage*, then *Pull or Deploy*, then *Update from Remote*
   (or upload the new ZIP and extract it over the old files).
3. If `package.json` changed, click **Run NPM Install** again. Then click **Restart**.

Your paintings, uploads and orders stay in `DATA_DIR` and aren't touched by an update.

## Before going live

- The API has no authentication: anyone who finds it can add, edit or delete paintings.
  Add a login for the Studio first.
- Checkout records orders but takes no payment.
- Node 18 no longer receives security updates. Move to a newer Node version when the host offers one;
  the same code runs on Node 22.5 and newer without `better-sqlite3`.
