import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import type sql from 'mssql'
import type { Artwork, Order, OrderSummary } from '../src/types.ts'
import { createApp } from './app.ts'
import { studioAuth } from './auth.ts'
import type { DatabaseSettings } from './config.ts'
import { connect, openRepository, seedIfEmpty, type Repository } from './db.ts'
import { seedArtworks } from './seed.ts'

/*
 * These tests need a SQL Server where they may create (and then drop) a database of their own.
 * They never use the site's settings file, so they can't touch the live database.
 * GitHub Actions provides one; locally, set TEST_DB_SERVER, TEST_DB_USER and TEST_DB_PASSWORD
 * (and TEST_DB_PORT if not 1433) to run them.
 */
const env = process.env
const skip = env.TEST_DB_SERVER
  ? false
  : 'set TEST_DB_SERVER, TEST_DB_USER and TEST_DB_PASSWORD to a SQL Server the tests may create a database on'
const base: DatabaseSettings = {
  server: env.TEST_DB_SERVER ?? '',
  port: Number(env.TEST_DB_PORT ?? 1433),
  database: 'master',
  user: env.TEST_DB_USER ?? '',
  password: env.TEST_DB_PASSWORD ?? '',
  encrypt: true,
  trustServerCertificate: true,
}
const PASSWORD = 'correct horse battery staple'

describe('ArteTotal API on SQL Server', { skip }, () => {
  let admin: sql.ConnectionPool
  let dbName: string
  let repo: Repository
  let uploads: string
  let app: ReturnType<typeof createApp>
  let cookie = ''

  before(async () => {
    admin = await connect(base)
    dbName = `artetotal_test_${Date.now()}`
    await admin.request().batch(`CREATE DATABASE [${dbName}]`)
    repo = await openRepository({ ...base, database: dbName })
  })

  after(async () => {
    await repo?.close()
    if (admin) {
      await admin.request().batch(`ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${dbName}]`)
      await admin.close()
    }
  })

  beforeEach(async () => {
    await repo.pool.request().batch('DELETE FROM dbo.order_items; DELETE FROM dbo.orders; DELETE FROM dbo.artworks;')
    await seedIfEmpty(repo.pool)
    if (uploads) rmSync(uploads, { recursive: true, force: true })
    uploads = mkdtempSync(join(tmpdir(), 'artetotal-'))
    app = createApp(repo, uploads, studioAuth(PASSWORD))
    cookie = await signIn()
  })

  async function signIn(password = PASSWORD) {
    const res = await app.request('/api/session', json('POST', { password }, ''))
    return res.headers.get('set-cookie')?.split(';')[0] ?? ''
  }

  /** A JSON request, sent with the Studio cookie unless `as` is given. */
  const json = (method: string, body: unknown, as = cookie): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json', cookie: as },
    body: JSON.stringify(body),
  })
  const signedIn = (init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as object), cookie } })

  const customer = { name: 'Ana Ruiz', email: 'ana@example.com', address: '1 Calle', city: 'Lima', postcode: '15001', country: 'Peru' }
  const available = () => seedArtworks.filter((a) => a.status === 'available').map((a) => a.id)

  /** A named upload. Built from a Blob because Node 18 has no global File. */
  type Upload = { blob: Blob; name: string }
  const upload = (parts: BlobPart[], name: string, type: string): Upload => ({ blob: new Blob(parts, { type }), name })

  function paintingForm(overrides: Record<string, string | Upload> = {}) {
    const form = new FormData()
    const fields = { title: 'Blue Harbour', year: '2025', medium: 'Oil on linen', dimensions: '40 x 50 cm', price: '$1,200', status: 'available', story: 'Boats at rest.' }
    for (const [k, v] of Object.entries({ ...fields, image: upload([new Uint8Array([1, 2, 3])], 'harbour.png', 'image/png'), ...overrides })) {
      if (typeof v === 'string') form.append(k, v)
      else form.append(k, v.blob, v.name)
    }
    return form
  }
  const createPainting = async () =>
    (await (await app.request('/api/artworks', signedIn({ method: 'POST', body: paintingForm() }))).json()) as Artwork
  const placeOrder = async (ids: string[]) => (await (await app.request('/api/orders', json('POST', { artworkIds: ids, customer }, ''))).json()) as Order

  test('lists the seeded collection in order', async () => {
    const res = await app.request('/api/artworks')
    assert.equal(res.status, 200)
    const works = (await res.json()) as Artwork[]
    assert.deepEqual(works.map((a) => a.id), seedArtworks.map((a) => a.id))
    assert.deepEqual(works[0], seedArtworks[0])
  })

  test('creates a painting with an uploaded image at the top of the collection', async () => {
    const res = await app.request('/api/artworks', signedIn({ method: 'POST', body: paintingForm() }))
    assert.equal(res.status, 201)
    const work = (await res.json()) as Artwork
    assert.match(work.id, /^blue-harbour-/)
    assert.equal(work.price, 1200)
    assert.match(work.image, /^\/uploads\/blue-harbour-.+\.png$/)
    assert.ok(existsSync(join(uploads, work.image.slice('/uploads/'.length))))
    assert.equal((await repo.list())[0].id, work.id)
  })

  test('changing the collection needs the Studio login', async () => {
    const id = available()[0]
    assert.equal((await app.request('/api/artworks', { method: 'POST', body: paintingForm() })).status, 401)
    assert.equal((await app.request(`/api/artworks/${id}`, json('PATCH', { status: 'reserved' }, ''))).status, 401)
    assert.equal((await app.request(`/api/artworks/${id}`, { method: 'DELETE' })).status, 401)
    assert.equal((await app.request('/api/orders')).status, 401)
    assert.equal((await app.request('/api/orders/AT-12345', json('PATCH', { status: 'paid' }, ''))).status, 401)
    assert.equal((await repo.get(id))!.status, 'available')
  })

  test('signs in with the right password only, and signs out', async () => {
    assert.deepEqual(await (await app.request('/api/session', signedIn())).json(), { signedIn: true, configured: true })
    assert.deepEqual(await (await app.request('/api/session')).json(), { signedIn: false, configured: true })

    const wrong = await app.request('/api/session', json('POST', { password: 'nope' }, ''))
    assert.equal(wrong.status, 401)
    assert.equal(wrong.headers.get('set-cookie'), null)

    const out = await app.request('/api/session', signedIn({ method: 'DELETE' }))
    assert.equal(out.status, 204)
    assert.match(out.headers.get('set-cookie') ?? '', /Max-Age=0/)
  })

  test('a forged or expired cookie is not signed in', async () => {
    const forged = cookie.replace(/=\d+/, `=${Date.now() + 1e9}`)
    assert.equal((await app.request('/api/orders', { headers: { cookie: forged } })).status, 401)
    const other = studioAuth('another password')
    const otherApp = createApp(repo, uploads, other)
    assert.equal((await otherApp.request('/api/orders', signedIn())).status, 401)
  })

  test('pauses sign-in after repeated wrong passwords', async () => {
    for (let i = 0; i < 5; i++) await app.request('/api/session', json('POST', { password: `guess ${i}` }, ''))
    const locked = await app.request('/api/session', json('POST', { password: PASSWORD }, ''))
    assert.equal(locked.status, 429)
    assert.ok(Number(locked.headers.get('retry-after')) > 0)
  })

  test('with no Studio password set, the Studio stays locked', async () => {
    const locked = createApp(repo, uploads, studioAuth(''))
    assert.equal((await locked.request('/api/session', json('POST', { password: '' }, ''))).status, 403)
    assert.equal((await locked.request('/api/orders')).status, 403)
  })

  test('rejects invalid fields and unsupported images with field errors', async () => {
    const res = await app.request('/api/artworks', signedIn({
      method: 'POST',
      body: paintingForm({ title: ' ', year: '1492', medium: 'x'.repeat(301), image: upload(['x'], 'notes.txt', 'text/plain') }),
    }))
    assert.equal(res.status, 422)
    const { fields } = (await res.json()) as { fields: Record<string, string> }
    assert.deepEqual(Object.keys(fields).sort(), ['image', 'medium', 'title', 'year'])
  })

  test('updates only the fields sent', async () => {
    const id = available()[0]
    const res = await app.request(`/api/artworks/${id}`, json('PATCH', { status: 'reserved' }))
    assert.equal(res.status, 200)
    const work = (await res.json()) as Artwork
    assert.equal(work.status, 'reserved')
    assert.equal(work.title, seedArtworks.find((a) => a.id === id)!.title)

    assert.equal((await app.request(`/api/artworks/${id}`, json('PATCH', { status: 'lost' }))).status, 422)
  })

  test('edits details and replaces the image, deleting the old upload', async () => {
    const created = await createPainting()
    const oldFile = join(uploads, created.image.slice('/uploads/'.length))

    const form = new FormData()
    form.append('title', 'Blue Harbour at Dusk')
    form.append('price', '1500')
    form.append('image', new Blob([new Uint8Array([4, 5])], { type: 'image/webp' }), 'dusk.webp')
    const res = await app.request(`/api/artworks/${created.id}`, signedIn({ method: 'PATCH', body: form }))
    assert.equal(res.status, 200)
    const work = (await res.json()) as Artwork

    assert.equal(work.id, created.id)
    assert.equal(work.title, 'Blue Harbour at Dusk')
    assert.equal(work.price, 1500)
    assert.equal(work.medium, created.medium)
    assert.match(work.image, /\.webp$/)
    assert.notEqual(work.image, created.image)
    assert.ok(existsSync(join(uploads, work.image.slice('/uploads/'.length))))
    assert.ok(!existsSync(oldFile))
  })

  test('an edit with invalid fields or a missing painting changes nothing', async () => {
    const id = available()[0]
    const bad = await app.request(`/api/artworks/${id}`, json('PATCH', { title: '', price: 0 }))
    assert.equal(bad.status, 422)
    assert.deepEqual(Object.keys(((await bad.json()) as { fields: object }).fields).sort(), ['price', 'title'])
    assert.deepEqual(await repo.get(id), seedArtworks.find((a) => a.id === id))

    assert.equal((await app.request('/api/artworks/nope', json('PATCH', { title: 'X' }))).status, 404)
  })

  test('deletes a painting and its uploaded image', async () => {
    const created = await createPainting()
    const file = join(uploads, created.image.slice('/uploads/'.length))

    assert.equal((await app.request(`/api/artworks/${created.id}`, signedIn({ method: 'DELETE' }))).status, 204)
    assert.equal(await repo.get(created.id), undefined)
    assert.ok(!existsSync(file))
    assert.equal((await app.request(`/api/artworks/${created.id}`, signedIn({ method: 'DELETE' }))).status, 404)
  })

  test('placing an order marks the paintings sold and records it as New', async () => {
    const ids = available().slice(0, 2)
    const res = await app.request('/api/orders', json('POST', { artworkIds: ids, customer }, ''))
    assert.equal(res.status, 201)
    const order = (await res.json()) as Order
    assert.match(order.number, /^AT-\d{5}$/)
    assert.equal(order.total, ids.reduce((s, id) => s + seedArtworks.find((a) => a.id === id)!.price, 0))
    for (const id of ids) assert.equal((await repo.get(id))!.status, 'sold')

    const [listed] = (await (await app.request('/api/orders', signedIn())).json()) as OrderSummary[]
    assert.equal(listed.number, order.number)
    assert.equal(listed.status, 'new')
    assert.deepEqual(listed.customer, customer)
    assert.deepEqual(listed.items.map((i) => i.artworkId).sort(), [...ids].sort())
  })

  test('two customers ordering the same painting at once: only one succeeds', async () => {
    const [id] = available()
    const results = await Promise.all([1, 2].map(() => app.request('/api/orders', json('POST', { artworkIds: [id], customer }, ''))))
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
    assert.equal((await repo.listOrders()).length, 1)
  })

  test('an order with an unavailable painting changes nothing', async () => {
    const [free] = available()
    const sold = seedArtworks.find((a) => a.status === 'sold')!.id
    const res = await app.request('/api/orders', json('POST', { artworkIds: [free, sold], customer }, ''))
    assert.equal(res.status, 409)
    assert.deepEqual(((await res.json()) as { unavailable: string[] }).unavailable, [sold])
    assert.equal((await repo.get(free))!.status, 'available')
    assert.equal((await repo.listOrders()).length, 0)
  })

  test('an order needs complete customer details', async () => {
    const res = await app.request('/api/orders', json('POST', { artworkIds: available().slice(0, 1), customer: { ...customer, email: 'nope' } }, ''))
    assert.equal(res.status, 422)
  })

  test('moves an order through New, Paid and Shipped, and not back', async () => {
    const { number } = await placeOrder(available().slice(0, 1))
    const set = (status: string) => app.request(`/api/orders/${number}`, json('PATCH', { status }))

    const paid = await set('paid')
    assert.equal(paid.status, 200)
    assert.equal(((await paid.json()) as OrderSummary).status, 'paid')
    assert.equal(((await (await set('shipped')).json()) as OrderSummary).status, 'shipped')

    const cancel = await set('cancelled')
    assert.equal(cancel.status, 409)
    assert.deepEqual(((await cancel.json()) as { allowed: string[] }).allowed, [])
    assert.equal((await set('lost')).status, 422)
    assert.equal((await app.request('/api/orders/AT-00000', json('PATCH', { status: 'paid' }))).status, 404)
  })

  test('cancelling an order puts its paintings back on sale', async () => {
    const ids = available().slice(0, 2)
    const { number } = await placeOrder(ids)
    const res = await app.request(`/api/orders/${number}`, json('PATCH', { status: 'cancelled' }))
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as OrderSummary).status, 'cancelled')
    for (const id of ids) assert.equal((await repo.get(id))!.status, 'available')
  })
})
