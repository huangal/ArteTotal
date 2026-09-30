# ArteTotal API

JSON API for the collection and orders, backed by SQLite (`server/data/artetotal.db`).
All routes are under `/api`. Errors return `{ "error": string }`, and validation errors
(422) add `"fields": { [field]: message }`.

A painting (`Artwork`, see `src/types.ts`):

```json
{
  "id": "peaches-and-cherries",
  "title": "Peaches and Cherries",
  "year": 2024,
  "medium": "Oil on canvas",
  "dimensions": "28 x 36 cm",
  "price": 1450,
  "status": "available",
  "image": "/art/peaches-and-cherries.jpg",
  "story": "..."
}
```

`status` is `available`, `reserved` or `sold`. `price` is whole US dollars.

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| GET | `/api/artworks` | none | 200, every painting, in display order |
| GET | `/api/artworks/:id` | none | 200, one painting (404 if missing) |
| POST | `/api/artworks` | `multipart/form-data`: every field above except `id` and `image`, plus an `image` file (JPEG, PNG, WebP or AVIF, up to 25 MB) | 201, the new painting, placed first |
| PATCH | `/api/artworks/:id` | JSON with any of those fields, e.g. `{ "status": "reserved" }`. To also replace the image, send `multipart/form-data` with the fields and an `image` file | 200, the updated painting; a replaced uploaded image is deleted |
| DELETE | `/api/artworks/:id` | none | 204; an uploaded image is deleted with it |
| POST | `/api/orders` | JSON `{ "artworkIds": string[], "customer": { name, email, address, city, postcode, country } }` | 201, `{ number, total, items }` |

Placing an order checks and updates every painting in a single transaction, so it
either marks all of them `sold` or none of them. If any painting is missing or
not `available`, it returns 409 with `"unavailable": [ids]`.

Uploaded images are served from `/uploads/<file>`. No payment is taken yet, and the API
has no authentication, so anyone who can reach it can add, change or delete paintings.
Add authentication before exposing it publicly.
