import { existsSync, mkdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp, UPLOADS_PATH } from './app.ts'
import { openRepository } from './db.ts'

const port = Number(process.env.PORT ?? 3001)
const dataDir = resolve(process.env.DATA_DIR ?? join(import.meta.dirname, 'data'))
const uploadsDir = join(dataDir, 'uploads')
const distDir = resolve(import.meta.dirname, '..', 'dist')

const repo = openRepository(join(dataDir, 'artetotal.db'))
mkdirSync(uploadsDir, { recursive: true })
const app = new Hono()
app.route('/', createApp(repo, uploadsDir))

// serveStatic resolves `root` against the working directory.
app.use(
  `${UPLOADS_PATH}*`,
  serveStatic({ root: relative(process.cwd(), uploadsDir), rewriteRequestPath: (p) => p.slice(UPLOADS_PATH.length - 1) }),
)

// After `npm run build`, the same process also serves the site.
if (existsSync(distDir)) {
  const root = relative(process.cwd(), distDir)
  app.use('*', serveStatic({ root }))
  app.get('*', serveStatic({ root, path: 'index.html' }))
}

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`ArteTotal API on http://localhost:${port}/api (data in ${dataDir})`)
})

const shutdown = () => server.close(() => (repo.close(), process.exit(0)))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
