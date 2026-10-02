# Artwork images

Painting images for the seed collection. Each file is referenced by the `image`
field of an entry in `server/seed.ts`.

The seed is only loaded into an empty database. The easiest way to add a painting
is the Artist Studio on the site: it saves the image to `server/data/uploads/`
and the details to the database. To add a painting to the seed instead, drop the
image here (JPEG, long edge about 2000-2400px), add an entry to `seedArtworks`
pointing at `/art/<file>.jpg`, then delete `server/data/` to re-seed. Re-seeding
also discards any uploads and orders.
