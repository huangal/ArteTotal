import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ORDER_STATUS_NEXT, type ArtworkFields, type ArtworkStatus, type Customer, type OrderStatus } from '../src/types.ts'
import type { StudioAuth } from './auth.ts'
import { StatusChangeError, UnavailableError, type Repository } from './db.ts'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}
const STATUSES: ArtworkStatus[] = ['available', 'reserved', 'sold']
const MAX_ORDER_ITEMS = 50
const MAX_PRICE = 2_000_000_000 // fits SQL Server's INT
/** Longest accepted text per field, matching the database columns (server/db.ts). */
const MAX_LENGTH = {
  title: 300,
  medium: 300,
  dimensions: 100,
  story: 20_000,
  name: 200,
  email: 320,
  address: 500,
  city: 200,
  postcode: 40,
  country: 100,
} as const
/** Public URL prefix that uploaded images are served under. */
export const UPLOADS_PATH = '/uploads/'

type FieldErrors = Record<string, string>

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Validates painting fields. With `partial`, only the fields present are checked and returned
 * (for PATCH); otherwise every field is required. Numbers may arrive as strings from a form.
 */
function readFields(body: Record<string, unknown>, partial: boolean) {
  const fields: Partial<ArtworkFields> = {}
  const errors: FieldErrors = {}
  const has = (k: keyof ArtworkFields) => !partial || body[k] !== undefined

  for (const k of ['title', 'medium', 'dimensions', 'story'] as const) {
    if (!has(k)) continue
    const v = text(body[k])
    if (!v) errors[k] = 'Required'
    else if (v.length > MAX_LENGTH[k]) errors[k] = `Keep it under ${MAX_LENGTH[k]} characters`
    else fields[k] = v
  }
  if (has('year')) {
    const year = Number(body.year)
    if (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1) fields.year = year
    else errors.year = 'Enter a four-digit year'
  }
  if (has('price')) {
    const price = Number(String(body.price ?? '').replace(/[^0-9.]/g, ''))
    if (body.price !== '' && Number.isFinite(price) && price > 0 && price <= MAX_PRICE) fields.price = Math.round(price)
    else errors.price = 'Enter a price in US dollars'
  }
  if (has('status')) {
    if (STATUSES.includes(body.status as ArtworkStatus)) fields.status = body.status as ArtworkStatus
    else errors.status = `Use one of: ${STATUSES.join(', ')}`
  }
  return { fields, errors }
}

function readCustomer(body: unknown) {
  const source = (body ?? {}) as Record<string, unknown>
  const customer = {} as Customer
  const errors: FieldErrors = {}
  for (const k of ['name', 'email', 'address', 'city', 'postcode', 'country'] as const) {
    customer[k] = text(source[k])
    if (!customer[k]) errors[k] = 'Required'
    else if (customer[k].length > MAX_LENGTH[k]) errors[k] = `Keep it under ${MAX_LENGTH[k]} characters`
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.email = 'Enter a valid email address'
  return { customer, errors }
}

const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0

/** An uploaded file. Checked as a Blob because Node 18 has no global File (form uploads are still Blobs). */
const isUpload = (v: unknown): v is Blob => v instanceof Blob

/** The HTTP API. `uploadsDir` is where uploaded images are written; the caller serves it at UPLOADS_PATH. */
export function createApp(repo: Repository, uploadsDir: string, auth: StudioAuth) {
  const app = new Hono().basePath('/api')

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'Something went wrong on the server' }, 500)
  })
  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  // Public: anyone can browse the collection and place an order.
  app.get('/artworks', async (c) => c.json(await repo.list()))

  app.get('/artworks/:id', async (c) => {
    const work = await repo.get(c.req.param('id'))
    return work ? c.json(work) : c.json({ error: 'Painting not found' }, 404)
  })

  // JSON body: { "artworkIds": string[], "customer": Customer }. New orders get status "new".
  app.post('/orders', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { artworkIds?: unknown; customer?: unknown } | null
    const ids = Array.isArray(body?.artworkIds) ? [...new Set(body.artworkIds.filter((id) => typeof id === 'string'))] : []
    if (ids.length === 0) return c.json({ error: 'The order has no paintings' }, 400)
    if (ids.length > MAX_ORDER_ITEMS) return c.json({ error: `An order can have at most ${MAX_ORDER_ITEMS} paintings` }, 400)
    const { customer, errors } = readCustomer(body?.customer)
    if (hasErrors(errors)) return c.json({ error: 'Check the highlighted fields', fields: errors }, 422)
    try {
      return c.json(await repo.placeOrder(ids, customer), 201)
    } catch (err) {
      if (err instanceof UnavailableError) {
        return c.json({ error: 'Some paintings in your cart are no longer available', unavailable: err.ids }, 409)
      }
      throw err
    }
  })

  // The Studio session: { "password": string } signs in; DELETE signs out.
  app.get('/session', async (c) => c.json({ signedIn: await auth.isSignedIn(c), configured: auth.configured }))

  app.post('/session', async (c) => {
    if (!auth.configured) return c.json({ error: "The Studio is locked: no Studio password is set in the site's settings." }, 403)
    const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null
    const result = auth.attempt(c, typeof body?.password === 'string' ? body.password : '')
    if (typeof result === 'number') {
      c.header('Retry-After', String(result))
      return c.json({ error: `Too many wrong passwords. Try again in ${result < 90 ? `${result} seconds` : `${Math.ceil(result / 60)} minutes`}.` }, 429)
    }
    if (result === 'wrong') return c.json({ error: "That password isn't right", fields: { password: "That password isn't right" } }, 401)
    await auth.signIn(c)
    return c.body(null, 204)
  })

  app.delete('/session', (c) => {
    auth.signOut(c)
    return c.body(null, 204)
  })

  // Everything below needs the Studio login.
  const studio = auth.required

  const imageLimit = bodyLimit({
    maxSize: MAX_IMAGE_BYTES + 1024 * 1024,
    onError: (c) => c.json({ error: 'That file is over 25 MB', fields: { image: 'That file is over 25 MB. Export a smaller version and try again.' } }, 413),
  })

  /** Checks an uploaded image, adding to `errors`. Returns its file extension when valid. */
  function checkImage(file: unknown, errors: FieldErrors) {
    const ext = isUpload(file) ? IMAGE_TYPES[file.type] : undefined
    if (!isUpload(file)) errors.image = 'Add an image of the painting.'
    else if (!ext) errors.image = 'Use a JPEG, PNG, WebP or AVIF image.'
    else if (file.size > MAX_IMAGE_BYTES) errors.image = 'That file is over 25 MB. Export a smaller version and try again.'
    return ext
  }

  /** Writes an uploaded image and returns its public URL. */
  async function saveImage(file: Blob, filename: string) {
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()))
    return UPLOADS_PATH + filename
  }

  /** Deletes an uploaded image. Seed images in public/art belong to the site and are left alone. */
  async function deleteImage(url: string) {
    if (url.startsWith(UPLOADS_PATH)) await unlink(join(uploadsDir, url.slice(UPLOADS_PATH.length))).catch(() => {})
  }

  // multipart/form-data: the painting fields plus an `image` file.
  app.post('/artworks', studio, imageLimit, async (c) => {
    const body = await c.req.parseBody()
    const { fields, errors } = readFields(body, false)
    const ext = checkImage(body.image, errors)
    if (hasErrors(errors) || !isUpload(body.image)) return c.json({ error: 'Check the highlighted fields', fields: errors }, 422)

    const id = `${slug(fields.title!).slice(0, 180) || 'untitled'}-${Date.now().toString(36)}`
    const image = await saveImage(body.image, `${id}.${ext}`)
    try {
      return c.json(await repo.create(id, fields as ArtworkFields, image), 201)
    } catch (err) {
      await deleteImage(image)
      throw err
    }
  })

  // Any subset of the painting fields, e.g. { "status": "reserved" }, as JSON.
  // To also replace the image, send multipart/form-data with an `image` file.
  app.patch('/artworks/:id', studio, imageLimit, async (c) => {
    const multipart = c.req.header('content-type')?.startsWith('multipart/form-data')
    const body = multipart ? await c.req.parseBody() : await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return c.json({ error: 'Send a JSON object' }, 400)
    const { fields, errors } = readFields(body, true)
    const file = multipart ? body.image : undefined
    const ext = file === undefined ? undefined : checkImage(file, errors)
    if (hasErrors(errors)) return c.json({ error: 'Check the highlighted fields', fields: errors }, 422)

    const current = await repo.get(c.req.param('id'))
    if (!current) return c.json({ error: 'Painting not found' }, 404)
    if (!isUpload(file)) return c.json(await repo.update(current.id, fields))

    // A new file name, so browsers don't keep showing the old image from cache.
    const image = await saveImage(file, `${current.id}-${Date.now().toString(36)}.${ext}`)
    try {
      const work = await repo.update(current.id, { ...fields, image })
      await deleteImage(current.image)
      return c.json(work)
    } catch (err) {
      await deleteImage(image)
      throw err
    }
  })

  app.delete('/artworks/:id', studio, async (c) => {
    const work = await repo.remove(c.req.param('id'))
    if (!work) return c.json({ error: 'Painting not found' }, 404)
    await deleteImage(work.image)
    return c.body(null, 204)
  })

  // Orders, newest first, with the customer's details.
  app.get('/orders', studio, async (c) => c.json(await repo.listOrders()))

  // JSON body: { "status": "paid" | "shipped" | "cancelled" }. Cancelling puts the paintings back on sale.
  app.patch('/orders/:number', studio, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null
    const status = body?.status as OrderStatus
    if (!(status in ORDER_STATUS_NEXT)) {
      return c.json({ error: `Use one of: ${Object.keys(ORDER_STATUS_NEXT).join(', ')}`, fields: { status: 'Choose a status' } }, 422)
    }
    try {
      const order = await repo.setOrderStatus(c.req.param('number'), status)
      return order ? c.json(order) : c.json({ error: 'Order not found' }, 404)
    } catch (err) {
      if (err instanceof StatusChangeError) {
        const options = err.allowed.length > 0 ? `It can become: ${err.allowed.join(', ')}.` : "It can't change any more."
        return c.json({ error: `This order is ${err.from}. ${options}`, allowed: err.allowed }, 409)
      }
      throw err
    }
  })

  return app
}
