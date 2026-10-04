# ArteTotal API

JSON API for the collection and orders, backed by Microsoft SQL Server (2016 or newer). Connection
details and the Studio password come from `artetotal.settings.json` (see `server/config.ts`).
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

**Studio** routes need the Studio login: sign in with `POST /api/session`, which sets a signed,
HttpOnly cookie for 7 days. Without it they return 401 (or 403 if no Studio password is set).

| Method | Path | Who | Body | Success |
| --- | --- | --- | --- | --- |
| GET | `/api/artworks` | anyone | none | 200, every painting, in display order |
| GET | `/api/artworks/:id` | anyone | none | 200, one painting (404 if missing) |
| POST | `/api/orders` | anyone | JSON `{ "artworkIds": string[], "customer": { name, email, address, city, postcode, country } }` | 201, `{ number, total, items }`; the order's status is `new` |
| GET | `/api/session` | anyone | none | 200, `{ signedIn, configured }` |
| POST | `/api/session` | anyone | JSON `{ "password": string }` | 204 and the cookie; 401 if wrong; 429 after 5 wrong tries (with `Retry-After`) |
| DELETE | `/api/session` | anyone | none | 204, signed out |
| POST | `/api/artworks` | Studio | `multipart/form-data`: every painting field except `id` and `image`, plus an `image` file (JPEG, PNG, WebP or AVIF, up to 25 MB) | 201, the new painting, placed first |
| PATCH | `/api/artworks/:id` | Studio | JSON with any of those fields, e.g. `{ "status": "reserved" }`. To also replace the image, send `multipart/form-data` with the fields and an `image` file | 200, the updated painting; a replaced uploaded image is deleted |
| DELETE | `/api/artworks/:id` | Studio | none | 204; an uploaded image is deleted with it |
| GET | `/api/orders` | Studio | none | 200, every order, newest first (`OrderSummary` in `src/types.ts`: status, customer, items, dates) |
| PATCH | `/api/orders/:number` | Studio | JSON `{ "status": "paid" \| "shipped" \| "cancelled" }` | 200, the updated order; 409 if the change isn't allowed |

Placing an order locks and updates its paintings in a single transaction, so it either marks
all of them `sold` or none of them, and two customers can't buy the same painting. If any
painting is missing or not `available`, it returns 409 with `"unavailable": [ids]`.

Order statuses go `new` → `paid` → `shipped`; `new` and `paid` orders can also be `cancelled`,
which puts their paintings back to `available`. Shipped and cancelled orders don't change.

Uploaded images are stored on disk (`server/data/uploads`, or `DATA_DIR/uploads`) and served
from `/uploads/<file>`. No payment is taken yet.

## Database

On first start the app creates its tables (`artworks`, `orders`, `order_items`) if they're
missing, so its login needs CREATE TABLE permission, and loads the original paintings into
an empty collection. `npm run db:check` tests the connection without changing anything;
`npm run db:migrate` copies data from the previous SQLite database (preview first, then `-- --yes`).
