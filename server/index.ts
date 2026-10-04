import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp, UPLOADS_PATH } from './app.ts'
import { studioAuth } from './auth.ts'
import { checkDatabaseSettings, loadSettings } from './config.ts'
import { openRepository } from './db.ts'

// import.meta.dirname needs Node 20.11; this works on Node 18 too.
const here = dirname(fileURLToPath(import.meta.url))
// A port number, or (under iisnode on Windows/IIS) the named pipe IIS forwards requests through.
const portSetting = process.env.PORT ?? '3001'
const port = /^\d+$/.test(portSetting) ? Number(portSetting) : portSetting
const distDir = resolve(here, '..', 'dist')

const settings = loadSettings()
checkDatabaseSettings(settings)
const uploadsDir = join(settings.dataDir, 'uploads')
mkdirSync(uploadsDir, { recursive: true })
const repo = await openRepository(settings.database)
const auth = studioAuth(settings.studioPassword)
if (!auth.configured) console.warn('No Studio password is set: the Studio is locked until one is added to the settings.')

const app = new Hono()
app.route('/', createApp(repo, uploadsDir, auth))

// Absolute roots, so serving files doesn't depend on the working directory the host starts us in.
app.use(`${UPLOADS_PATH}*`, serveStatic({ root: uploadsDir, rewriteRequestPath: (p) => p.slice(UPLOADS_PATH.length - 1) }))

// After `npm run build`, the same process also serves the site.
if (existsSync(distDir)) {
  app.use('*', serveStatic({ root: distDir }))
  app.get('*', serveStatic({ root: distDir, path: 'index.html' }))
}

const server = createServer(getRequestListener(app.fetch))
server.listen(port, () => {
  const where = typeof port === 'number' ? `http://localhost:${port}/api` : `pipe ${port}`
  const db = settings.database
  console.log(`ArteTotal API on ${where} (SQL Server ${db.server}/${db.database}, uploads in ${uploadsDir})`)
})

const shutdown = () => server.close(() => void repo.close().finally(() => process.exit(0)))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
