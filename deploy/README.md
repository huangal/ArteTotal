# ArteTotal deploy package

This is the built site, ready to run on Node.js 18.17 or newer. It's set up for
**Windows hosting with IIS and iisnode** (Node 18.20.4), and also runs on any host
that starts `app.cjs` or `npm start`. It is generated from `main`, so don't edit files
here: change `main` and release again.

**Nothing needs installing.** There is no `npm install` step: the server and its
libraries are bundled into one file, and the database engine (SQLite, as WebAssembly)
is included.

| Path | What it is |
| --- | --- |
| `app.cjs` | Startup file. iisnode runs this. |
| `web.config` | IIS settings: sends every request to the app and allows 25 MB uploads. |
| `server/index.js` | The server and API, bundled into one file. It also serves the site. |
| `server/vendor/` | SQLite (sql.js) for Node versions without built-in SQLite. |
| `server/data/` | Where the site saves its database and uploads. Ships empty (just a README). |
| `dist/` | The built website, including the painting images. |

## First deploy (Windows / IIS)

1. In your hosting panel, make sure the site uses **Node.js** (18.20.4) and that the
   **startup file** is `app.cjs`. If the panel generates its own `web.config`, use
   the one in this package instead, or copy its settings into the panel's.
2. Upload **all** files from this package (the GitHub Release ZIP, extracted) into the
   site's root folder, replacing what's there. Leave out any old `node_modules` folder:
   it isn't needed and an incomplete one can break the app.
3. **Data folder.** The database, uploaded paintings and orders are saved in
   `server\data` inside the site, unless the environment variable `DATA_DIR` points
   elsewhere. The package includes that folder (empty apart from a README), so you can
   set its permission before the first start: the site's IIS user (the application pool
   identity, or IUSR) needs permission to **modify** it. If your panel lets you set environment
   variables, set `DATA_DIR` to a folder outside the website, e.g. `D:\...\private\artetotal-data`.
4. Restart the site (or recycle its application pool), then open it. The first start
   creates the database and loads the original 20 paintings.

If the server can't start, the site shows a page titled **"ArteTotal couldn't start"**
with the reason and what to do (most often: give the site's user write permission on the
data folder). For any other error, set `devErrorsEnabled="true"` in `web.config` to see
Node's output in the browser, and check the `iisnode` folder in the site for logs.
Set it back to `"false"` afterwards.

## Updating

1. Publish a new build: push a version tag from `main` (`git tag v1.0.2 && git push origin v1.0.2`).
   GitHub builds it, updates the `release` branch and attaches a ZIP to a new GitHub Release.
2. Upload the new files over the old ones. This replaces only the README in `server\data`.
   **Don't delete `server\data`** if your data is stored there: it holds the paintings
   added in the Studio and all orders.
3. Restart the site. (iisnode also restarts by itself when `app.cjs`, `server\index.js`
   or `web.config` change.)

## Other hosts

Any host with Node 18.17+ can run it with `npm start` (or `node app.cjs`). It listens on
`PORT` (a number, or a pipe path as iisnode provides). Run **one** server process: the
database is kept in memory by the process and written to disk on every change.

## Before going live

- The API has no authentication: anyone who finds it can add, edit or delete paintings.
  Add a login for the Studio first.
- Checkout records orders but takes no payment.
- Node 18 no longer receives security updates. Move to a newer Node version when the host
  offers one; the same package runs on newer versions unchanged.
