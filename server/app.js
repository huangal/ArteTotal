import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { UnavailableError } from "./db.js";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
};
const STATUSES = ['available', 'reserved', 'sold'];
/** Public URL prefix that uploaded images are served under. */
export const UPLOADS_PATH = '/uploads/';
const slug = (s) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const text = (v) => (typeof v === 'string' ? v.trim() : '');
/**
 * Validates painting fields. With `partial`, only the fields present are checked and returned
 * (for PATCH); otherwise every field is required. Numbers may arrive as strings from a form.
 */
function readFields(body, partial) {
    const fields = {};
    const errors = {};
    const has = (k) => !partial || body[k] !== undefined;
    for (const k of ['title', 'medium', 'dimensions', 'story']) {
        if (!has(k))
            continue;
        const v = text(body[k]);
        if (v)
            fields[k] = v;
        else
            errors[k] = 'Required';
    }
    if (has('year')) {
        const year = Number(body.year);
        if (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1)
            fields.year = year;
        else
            errors.year = 'Enter a four-digit year';
    }
    if (has('price')) {
        const price = Number(String(body.price ?? '').replace(/[^0-9.]/g, ''));
        if (body.price !== '' && Number.isFinite(price) && price > 0)
            fields.price = Math.round(price);
        else
            errors.price = 'Enter a price in US dollars';
    }
    if (has('status')) {
        if (STATUSES.includes(body.status))
            fields.status = body.status;
        else
            errors.status = `Use one of: ${STATUSES.join(', ')}`;
    }
    return { fields, errors };
}
function readCustomer(body) {
    const source = (body ?? {});
    const customer = {};
    const errors = {};
    for (const k of ['name', 'email', 'address', 'city', 'postcode', 'country']) {
        customer[k] = text(source[k]);
        if (!customer[k])
            errors[k] = 'Required';
    }
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
        errors.email = 'Enter a valid email address';
    return { customer, errors };
}
const hasErrors = (errors) => Object.keys(errors).length > 0;
/** An uploaded file. Checked as a Blob because Node 18 has no global File (form uploads are still Blobs). */
const isUpload = (v) => v instanceof Blob;
/** The HTTP API. `uploadsDir` is where uploaded images are written; the caller serves it at UPLOADS_PATH. */
export function createApp(repo, uploadsDir) {
    const app = new Hono().basePath('/api');
    app.onError((err, c) => {
        console.error(err);
        return c.json({ error: 'Something went wrong on the server' }, 500);
    });
    app.notFound((c) => c.json({ error: 'Not found' }, 404));
    app.get('/artworks', (c) => c.json(repo.list()));
    app.get('/artworks/:id', (c) => {
        const work = repo.get(c.req.param('id'));
        return work ? c.json(work) : c.json({ error: 'Painting not found' }, 404);
    });
    const imageLimit = bodyLimit({
        maxSize: MAX_IMAGE_BYTES + 1024 * 1024,
        onError: (c) => c.json({ error: 'That file is over 25 MB', fields: { image: 'That file is over 25 MB. Export a smaller version and try again.' } }, 413),
    });
    /** Checks an uploaded image, adding to `errors`. Returns its file extension when valid. */
    function checkImage(file, errors) {
        const ext = isUpload(file) ? IMAGE_TYPES[file.type] : undefined;
        if (!isUpload(file))
            errors.image = 'Add an image of the painting.';
        else if (!ext)
            errors.image = 'Use a JPEG, PNG, WebP or AVIF image.';
        else if (file.size > MAX_IMAGE_BYTES)
            errors.image = 'That file is over 25 MB. Export a smaller version and try again.';
        return ext;
    }
    /** Writes an uploaded image and returns its public URL. */
    async function saveImage(file, filename) {
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()));
        return UPLOADS_PATH + filename;
    }
    /** Deletes an uploaded image. Seed images in public/art belong to the site and are left alone. */
    async function deleteImage(url) {
        if (url.startsWith(UPLOADS_PATH))
            await unlink(join(uploadsDir, url.slice(UPLOADS_PATH.length))).catch(() => { });
    }
    // multipart/form-data: the painting fields plus an `image` file.
    app.post('/artworks', imageLimit, async (c) => {
        const body = await c.req.parseBody();
        const { fields, errors } = readFields(body, false);
        const ext = checkImage(body.image, errors);
        if (hasErrors(errors) || !isUpload(body.image))
            return c.json({ error: 'Check the highlighted fields', fields: errors }, 422);
        const id = `${slug(fields.title) || 'untitled'}-${Date.now().toString(36)}`;
        const image = await saveImage(body.image, `${id}.${ext}`);
        try {
            return c.json(repo.create(id, fields, image), 201);
        }
        catch (err) {
            await deleteImage(image);
            throw err;
        }
    });
    // Any subset of the painting fields, e.g. { "status": "reserved" }, as JSON.
    // To also replace the image, send multipart/form-data with an `image` file.
    app.patch('/artworks/:id', imageLimit, async (c) => {
        const multipart = c.req.header('content-type')?.startsWith('multipart/form-data');
        const body = multipart ? await c.req.parseBody() : await c.req.json().catch(() => null);
        if (!body || typeof body !== 'object')
            return c.json({ error: 'Send a JSON object' }, 400);
        const { fields, errors } = readFields(body, true);
        const file = multipart ? body.image : undefined;
        const ext = file === undefined ? undefined : checkImage(file, errors);
        if (hasErrors(errors))
            return c.json({ error: 'Check the highlighted fields', fields: errors }, 422);
        const current = repo.get(c.req.param('id'));
        if (!current)
            return c.json({ error: 'Painting not found' }, 404);
        if (!isUpload(file))
            return c.json(repo.update(current.id, fields));
        // A new file name, so browsers don't keep showing the old image from cache.
        const image = await saveImage(file, `${current.id}-${Date.now().toString(36)}.${ext}`);
        try {
            const work = repo.update(current.id, { ...fields, image });
            await deleteImage(current.image);
            return c.json(work);
        }
        catch (err) {
            await deleteImage(image);
            throw err;
        }
    });
    app.delete('/artworks/:id', async (c) => {
        const work = repo.remove(c.req.param('id'));
        if (!work)
            return c.json({ error: 'Painting not found' }, 404);
        await deleteImage(work.image);
        return c.body(null, 204);
    });
    // JSON body: { "artworkIds": string[], "customer": Customer }.
    app.post('/orders', async (c) => {
        const body = (await c.req.json().catch(() => null));
        const ids = Array.isArray(body?.artworkIds) ? [...new Set(body.artworkIds.filter((id) => typeof id === 'string'))] : [];
        if (ids.length === 0)
            return c.json({ error: 'The order has no paintings' }, 400);
        const { customer, errors } = readCustomer(body?.customer);
        if (hasErrors(errors))
            return c.json({ error: 'Check the highlighted fields', fields: errors }, 422);
        try {
            return c.json(repo.placeOrder(ids, customer), 201);
        }
        catch (err) {
            if (err instanceof UnavailableError) {
                return c.json({ error: 'Some paintings in your cart are no longer available', unavailable: err.ids }, 409);
            }
            throw err;
        }
    });
    return app;
}
