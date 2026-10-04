/**
 * Copies paintings and orders from a SQLite database (the app's previous storage) into the
 * SQL Server in artetotal.settings.json. Run on a computer with Node 24:
 *
 *   npm run db:migrate                         show what would change (nothing is written)
 *   npm run db:migrate -- --yes                copy it
 *   npm run db:migrate -- path/to/artetotal.db --yes
 *
 * Paintings: added, or updated if they already exist (same id), keeping the SQLite order.
 * Orders: added with status "new" unless an order with that number already exists.
 * Uploaded images aren't in the database: the script lists the files to upload to the host.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import sql from 'mssql'
import type { Artwork } from '../src/types.ts'
import { checkDatabaseSettings, loadSettings } from './config.ts'
import { connect, createSchema, insertArtwork, seedIfEmpty } from './db.ts'

const args = process.argv.slice(2)
const apply = args.includes('--yes')
const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = resolve(args.find((a) => !a.startsWith('--')) ?? join(here, 'data', 'artetotal.db'))
if (!existsSync(sourcePath)) {
  console.error(`No SQLite database at ${sourcePath}`)
  process.exit(1)
}

type Row = Record<string, string | number | null>
const source = new DatabaseSync(sourcePath, { readOnly: true })
const artworks = source.prepare('SELECT * FROM artworks ORDER BY sort_order').all() as Row[]
const orders = source.prepare('SELECT * FROM orders ORDER BY created_at').all() as Row[]
const items = source.prepare('SELECT * FROM order_items').all() as Row[]
source.close()

const settings = loadSettings()
checkDatabaseSettings(settings)
const db = settings.database
console.log(`From: ${sourcePath} (${artworks.length} paintings, ${orders.length} orders)`)
console.log(`To:   SQL Server ${db.server}, database ${db.database}${apply ? '' : '  [preview only: add --yes to copy]'}\n`)

const pool = await connect(db)
try {
  if (apply) {
    await createSchema(pool)
    await seedIfEmpty(pool)
  }
  const existing = new Set<string>()
  const existingOrders = new Set<string>()
  const tables = (await pool.request().query<{ name: string }>("SELECT name FROM sys.tables WHERE name IN ('artworks', 'orders')")).recordset.map((t) => t.name)
  if (tables.includes('artworks')) {
    for (const r of (await pool.request().query<{ id: string }>('SELECT id FROM dbo.artworks')).recordset) existing.add(r.id)
  }
  if (tables.includes('orders')) {
    for (const r of (await pool.request().query<{ number: string }>('SELECT number FROM dbo.orders')).recordset) existingOrders.add(r.number)
  }
  // Before the first start, the app would add the 20 original paintings; count those as present.
  if (!tables.includes('artworks')) console.log('(No tables yet: they will be created, with the original paintings.)')

  const toArtwork = (r: Row): Artwork => ({
    id: String(r.id),
    title: String(r.title),
    year: Number(r.year),
    medium: String(r.medium),
    dimensions: String(r.dimensions),
    price: Number(r.price),
    status: r.status as Artwork['status'],
    image: String(r.image),
    story: String(r.story),
    ...(r.fallback ? { fallback: String(r.fallback) } : {}),
  })

  const newOrders = orders.filter((o) => !existingOrders.has(String(o.number)))
  for (const a of artworks) console.log(`${existing.has(String(a.id)) ? 'update' : 'add   '}  painting  ${a.title} (${a.status})`)
  for (const o of orders) {
    console.log(`${existingOrders.has(String(o.number)) ? 'skip  ' : 'add   '}  order     ${o.number}, ${o.name}, $${o.total}${existingOrders.has(String(o.number)) ? ' (already there)' : ', status New'}`)
  }

  if (apply) {
    const tx = new sql.Transaction(pool)
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      for (const [i, row] of artworks.entries()) {
        const a = toArtwork(row)
        await new sql.Request(tx).input('id', sql.NVarChar(200), a.id).query('DELETE FROM dbo.artworks WHERE id = @id')
        await insertArtwork(new sql.Request(tx), a, i)
      }
      for (const o of newOrders) {
        const insert = new sql.Request(tx)
        for (const k of ['number', 'name', 'email', 'address', 'city', 'postcode', 'country'] as const) insert.input(k, sql.NVarChar(500), String(o[k]))
        // SQLite stored UTC as 'YYYY-MM-DD HH:MM:SS'.
        insert.input('total', sql.Int, Number(o.total)).input('created', sql.DateTime2(0), new Date(`${String(o.created_at).replace(' ', 'T')}Z`))
        await insert.query(`INSERT INTO dbo.orders (number, status, name, email, address, city, postcode, country, total, created_at, updated_at)
                            VALUES (@number, 'new', @name, @email, @address, @city, @postcode, @country, @total, @created, @created)`)
        for (const item of items.filter((i) => i.order_number === o.number)) {
          await new sql.Request(tx)
            .input('number', sql.NVarChar(20), String(o.number))
            .input('id', sql.NVarChar(200), String(item.artwork_id))
            .input('title', sql.NVarChar(300), String(item.title))
            .input('price', sql.Int, Number(item.price))
            .query('INSERT INTO dbo.order_items (order_number, artwork_id, title, price) VALUES (@number, @id, @title, @price)')
        }
      }
      await tx.commit()
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
    console.log(`\nCopied ${artworks.length} paintings and ${newOrders.length} orders.`)
  }

  const uploads = artworks.map((a) => String(a.image)).filter((img) => img.startsWith('/uploads/'))
  if (uploads.length > 0) {
    console.log(`\nUpload these image files to the host's server\\data\\uploads folder (they aren't in the database):`)
    for (const img of uploads) {
      const file = join(dirname(sourcePath), 'uploads', img.slice('/uploads/'.length))
      console.log(`  ${file}${existsSync(file) ? '' : '  (missing on this computer!)'}`)
    }
  }
} finally {
  await pool.close()
}
