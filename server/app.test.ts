import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import type { Artwork, Order } from '../src/types.ts'
import { createApp } from './app.ts'
import { openRepository, type Repository } from './db.ts'
import { seedArtworks } from './seed.ts'

let repo: Repository
let uploads: string
let app: ReturnType<typeof createApp>

beforeEach(() => {
  repo = openRepository(':memory:')
  uploads = mkdtempSync(join(tmpdir(), 'artetotal-'))
  app = createApp(repo, uploads)
})
afterEach(() => {
  repo.close()
  rmSync(uploads, { recursive: true, force: true })
})

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const customer = { name: 'Ana Ruiz', email: 'ana@example.com', address: '1 Calle', city: 'Lima', postcode: '15001', country: 'Peru' }
const available = () => seedArtworks.filter((a) => a.status === 'available').map((a) => a.id)

function paintingForm(overrides: Record<string, string | Blob> = {}) {
  const form = new FormData()
  const fields = { title: 'Blue Harbour', year: '2025', medium: 'Oil on linen', dimensions: '40 x 50 cm', price: '$1,200', status: 'available', story: 'Boats at rest.' }
  for (const [k, v] of Object.entries({ ...fields, image: new File([new Uint8Array([1, 2, 3])], 'harbour.png', { type: 'image/png' }), ...overrides })) {
    form.append(k, v)
  }
  return form
}

test('lists the seeded collection in order', async () => {
  const res = await app.request('/api/artworks')
  assert.equal(res.status, 200)
  const works = (await res.json()) as Artwork[]
  assert.deepEqual(works.map((a) => a.id), seedArtworks.map((a) => a.id))
})

test('creates a painting with an uploaded image at the top of the collection', async () => {
  const res = await app.request('/api/artworks', { method: 'POST', body: paintingForm() })
  assert.equal(res.status, 201)
  const work = (await res.json()) as Artwork
  assert.match(work.id, /^blue-harbour-/)
  assert.equal(work.price, 1200)
  assert.match(work.image, /^\/uploads\/blue-harbour-.+\.png$/)
  assert.ok(existsSync(join(uploads, work.image.slice('/uploads/'.length))))
  assert.equal(repo.list()[0].id, work.id)
})

test('rejects invalid fields and unsupported images with field errors', async () => {
  const res = await app.request('/api/artworks', {
    method: 'POST',
    body: paintingForm({ title: ' ', year: '1492', image: new File(['x'], 'notes.txt', { type: 'text/plain' }) }),
  })
  assert.equal(res.status, 422)
  const { fields } = (await res.json()) as { fields: Record<string, string> }
  assert.deepEqual(Object.keys(fields).sort(), ['image', 'title', 'year'])
})

test('updates only the fields sent', async () => {
  const id = available()[0]
  const res = await app.request(`/api/artworks/${id}`, json('PATCH', { status: 'reserved' }))
  assert.equal(res.status, 200)
  const work = (await res.json()) as Artwork
  assert.equal(work.status, 'reserved')
  assert.equal(work.title, seedArtworks.find((a) => a.id === id)!.title)

  const bad = await app.request(`/api/artworks/${id}`, json('PATCH', { status: 'lost' }))
  assert.equal(bad.status, 422)
})

test('edits details and replaces the image, deleting the old upload', async () => {
  const created = (await (await app.request('/api/artworks', { method: 'POST', body: paintingForm() })).json()) as Artwork
  const oldFile = join(uploads, created.image.slice('/uploads/'.length))

  const form = new FormData()
  form.append('title', 'Blue Harbour at Dusk')
  form.append('price', '1500')
  form.append('image', new File([new Uint8Array([4, 5])], 'dusk.webp', { type: 'image/webp' }))
  const res = await app.request(`/api/artworks/${created.id}`, { method: 'PATCH', body: form })
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
  assert.deepEqual(repo.get(id), seedArtworks.find((a) => a.id === id))

  assert.equal((await app.request('/api/artworks/nope', json('PATCH', { title: 'X' }))).status, 404)
})

test('deletes a painting and its uploaded image', async () => {
  const created = (await (await app.request('/api/artworks', { method: 'POST', body: paintingForm() })).json()) as Artwork
  const file = join(uploads, created.image.slice('/uploads/'.length))

  assert.equal((await app.request(`/api/artworks/${created.id}`, { method: 'DELETE' })).status, 204)
  assert.equal(repo.get(created.id), undefined)
  assert.ok(!existsSync(file))
  assert.equal((await app.request(`/api/artworks/${created.id}`, { method: 'DELETE' })).status, 404)
})

test('placing an order marks the paintings sold', async () => {
  const ids = available().slice(0, 2)
  const res = await app.request('/api/orders', json('POST', { artworkIds: ids, customer }))
  assert.equal(res.status, 201)
  const order = (await res.json()) as Order
  assert.match(order.number, /^AT-\d{5}$/)
  assert.equal(order.total, ids.reduce((s, id) => s + seedArtworks.find((a) => a.id === id)!.price, 0))
  for (const id of ids) assert.equal(repo.get(id)!.status, 'sold')
})

test('an order with an unavailable painting changes nothing', async () => {
  const [free] = available()
  const sold = seedArtworks.find((a) => a.status === 'sold')!.id
  const res = await app.request('/api/orders', json('POST', { artworkIds: [free, sold], customer }))
  assert.equal(res.status, 409)
  assert.deepEqual(((await res.json()) as { unavailable: string[] }).unavailable, [sold])
  assert.equal(repo.get(free)!.status, 'available')
})

test('an order needs complete customer details', async () => {
  const res = await app.request('/api/orders', json('POST', { artworkIds: available().slice(0, 1), customer: { ...customer, email: 'nope' } }))
  assert.equal(res.status, 422)
})
