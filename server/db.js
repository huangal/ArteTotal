import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { seedArtworks } from "./seed.js";
const require = createRequire(import.meta.url);
/**
 * Node 22.5+ has SQLite built in (node:sqlite). Older hosts (Node 18) use better-sqlite3,
 * which is a dependency of the deploy package only, so development needs no native build.
 */
function openDatabase(file) {
    let builtin;
    try {
        builtin = require('node:sqlite');
    }
    catch {
        // Not available on this Node version.
    }
    if (builtin)
        return new builtin.DatabaseSync(file);
    const BetterSqlite3 = require('better-sqlite3');
    return new BetterSqlite3(file);
}
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS artworks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    year        INTEGER NOT NULL,
    medium      TEXT NOT NULL,
    dimensions  TEXT NOT NULL,
    price       INTEGER NOT NULL CHECK (price > 0),
    status      TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
    image       TEXT NOT NULL,
    fallback    TEXT,
    story       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    number      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    address     TEXT NOT NULL,
    city        TEXT NOT NULL,
    postcode    TEXT NOT NULL,
    country     TEXT NOT NULL,
    total       INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- No foreign key to artworks: an order keeps its record even if the painting is later removed.
  CREATE TABLE IF NOT EXISTS order_items (
    order_number  TEXT NOT NULL REFERENCES orders (number),
    artwork_id    TEXT NOT NULL,
    title         TEXT NOT NULL,
    price         INTEGER NOT NULL,
    PRIMARY KEY (order_number, artwork_id)
  );
`;
const COLUMNS = 'id, title, year, medium, dimensions, price, status, image, fallback, story';
const toArtwork = ({ fallback, ...row }) => (fallback ? { ...row, fallback } : row);
/** Thrown when some of the requested paintings can no longer be bought. */
export class UnavailableError extends Error {
    ids;
    constructor(ids) {
        super('Some paintings are no longer available');
        this.ids = ids;
    }
}
/** Opens (and on first run creates and seeds) the database. Pass ':memory:' for a throwaway one. */
export function openRepository(file) {
    if (file !== ':memory:')
        mkdirSync(dirname(file), { recursive: true });
    const db = openDatabase(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    const transaction = (fn) => {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        }
        catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    };
    const insert = db.prepare(`
    INSERT INTO artworks (${COLUMNS}, sort_order)
    VALUES (:id, :title, :year, :medium, :dimensions, :price, :status, :image, :fallback, :story, :sort_order)
  `);
    const selectAll = db.prepare(`SELECT ${COLUMNS} FROM artworks ORDER BY sort_order`);
    const selectOne = db.prepare(`SELECT ${COLUMNS} FROM artworks WHERE id = ?`);
    const count = db.prepare('SELECT COUNT(*) AS n FROM artworks').get();
    if (count.n === 0) {
        transaction(() => seedArtworks.forEach((a, i) => insert.run({ ...a, fallback: a.fallback ?? null, sort_order: i })));
    }
    const get = (id) => {
        const row = selectOne.get(id);
        return row && toArtwork(row);
    };
    return {
        list: () => selectAll.all().map(toArtwork),
        get,
        /** Adds a painting at the top of the collection. */
        create(id, fields, image) {
            const { top } = db.prepare('SELECT COALESCE(MIN(sort_order), 0) - 1 AS top FROM artworks').get();
            insert.run({ ...fields, id, image, fallback: null, sort_order: top });
            return get(id);
        },
        /** Updates the given fields (and image); returns undefined if the painting does not exist. */
        update(id, fields) {
            // Keys come from validated fields only, never straight from a request.
            const keys = Object.keys(fields);
            if (keys.length > 0) {
                db.prepare(`UPDATE artworks SET ${keys.map((k) => `${k} = :${k}`).join(', ')}, updated_at = datetime('now') WHERE id = :id`).run({
                    ...fields,
                    id,
                });
            }
            return get(id);
        },
        /** Deletes a painting and returns it, or undefined if it did not exist. */
        remove(id) {
            const work = get(id);
            if (work)
                db.prepare('DELETE FROM artworks WHERE id = ?').run(id);
            return work;
        },
        /**
         * Records an order and marks its paintings sold, all or nothing.
         * Throws UnavailableError if any painting is missing or not available.
         */
        placeOrder(ids, customer) {
            return transaction(() => {
                const items = ids.map((id) => get(id));
                const unavailable = ids.filter((_, i) => items[i]?.status !== 'available');
                if (unavailable.length > 0)
                    throw new UnavailableError(unavailable);
                const works = items;
                const total = works.reduce((sum, a) => sum + a.price, 0);
                let number;
                do
                    number = `AT-${Math.floor(10000 + Math.random() * 90000)}`;
                while (db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number));
                db.prepare(`
          INSERT INTO orders (number, name, email, address, city, postcode, country, total)
          VALUES (:number, :name, :email, :address, :city, :postcode, :country, :total)
        `).run({ ...customer, number, total });
                const addItem = db.prepare('INSERT INTO order_items (order_number, artwork_id, title, price) VALUES (?, ?, ?, ?)');
                const markSold = db.prepare("UPDATE artworks SET status = 'sold', updated_at = datetime('now') WHERE id = ?");
                for (const a of works) {
                    addItem.run(number, a.id, a.title, a.price);
                    markSold.run(a.id);
                }
                return { number, total, items: works.map((a) => ({ ...a, status: 'sold' })) };
            });
        },
        close: () => db.close(),
    };
}
