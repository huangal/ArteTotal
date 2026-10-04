# ArteTotal deploy package

This is the built site, ready to run on Node.js 18.17 or newer. It's set up for
**Windows hosting with IIS and iisnode** (Node 18.20.4), and also runs on any host
that starts `app.cjs` or `npm start`. It is generated from `main`, so don't edit files
here: change `main` and release again.

**Nothing needs installing.** There is no `npm install` step: the server and its
libraries, including the SQL Server driver, are bundled into one file.

| Path | What it is |
| --- | --- |
| `app.cjs` | Startup file. iisnode runs this. |
| `web.config` | IIS settings: sends every request to the app, allows 25 MB uploads, and blocks the settings file from being downloaded. |
| `artetotal.settings.example.json` | Template for `artetotal.settings.json`, which you create once on the host. |
| `server/index.js` | The server and API, bundled into one file. It also serves the site. |
| `server/data/` | Where images uploaded in the Studio are saved. Ships empty (just a README). |
| `dist/` | The built website, including the painting images. |

The paintings and orders are stored in **Microsoft SQL Server** (2016 or newer).

## First deploy (Windows / IIS)

1. In your hosting panel, make sure the site uses **Node.js** (18.20.4) and that the
   **startup file** is `app.cjs`. If the panel generates its own `web.config`, use
   the one in this package instead, or copy its settings into the panel's.
2. Upload **all** files from this package (the GitHub Release ZIP, extracted) into the
   site's root folder, replacing what's there. Leave out any old `node_modules` folder.
3. **Settings.** Next to `web.config`, create `artetotal.settings.json` from
   `artetotal.settings.example.json` and fill in:
   - `database`: the SQL Server address, database name, login and password from your
     host's panel. Keep `encrypt` and `trustServerCertificate` as they are unless the
     host's instructions say otherwise.
   - `studioPassword`: the password for the Artist Studio. Choose a long one: anyone who
     knows it can change the collection and see customers' details.

   Releases never include this file, so updates won't overwrite it.
4. **Database permission.** On first start the site creates its tables, so the SQL login
   needs permission to create tables in its database (the `db_ddladmin` role). Most hosts
   give a database's own login this permission.
5. **Image folder.** Give the site's IIS user (the application pool identity, or IUSR)
   permission to **modify** `server\data`, where Studio uploads are saved.
6. Restart the site (or recycle its application pool), then open it. The first start
   creates the tables and loads the original 20 paintings.

If the server can't start, the site shows a page titled **"ArteTotal couldn't start"**
with the reason and what to do (for example: the settings are incomplete, SQL Server
refused the login, or it couldn't be reached). For any other error, set
`devErrorsEnabled="true"` in `web.config` to see Node's output in the browser, and check
the `iisnode` folder in the site for logs. Set it back to `"false"` afterwards.

## Updating

1. Publish a new build: push a version tag from `main` (`git tag v1.2.0 && git push origin v1.2.0`).
   GitHub tests it against a temporary SQL Server, builds it, updates the `release`
   branch and attaches a ZIP to a new GitHub Release.
2. Upload the new files over the old ones. This doesn't touch `artetotal.settings.json`
   and replaces only the README in `server\data`. **Don't delete `server\data`**: it holds
   the images added in the Studio.
3. Restart the site. (iisnode also restarts by itself when `app.cjs`, `server\index.js`,
   `web.config` or the settings file change.)

## Other hosts

Any host with Node 18.17+ can run it with `npm start` (or `node app.cjs`). It listens on
`PORT` (a number, or a pipe path as iisnode provides). Settings can also come from
environment variables instead of the file: `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, `STUDIO_PASSWORD`, `DATA_DIR`.

## Before going live

- Checkout records orders but takes no payment.
- Node 18 no longer receives security updates. Move to a newer Node version when the host
  offers one; the same package runs on newer versions unchanged.
