import sql from 'mssql'
import {
  ORDER_STATUS_NEXT,
  type Artwork,
  type ArtworkFields,
  type ArtworkStatus,
  type Customer,
  type Order,
  type OrderStatus,
  type OrderSummary,
} from '../src/types.ts'
import type { DatabaseSettings } from './config.ts'
import { seedArtworks } from './seed.ts'

interface ArtworkRow {
  id: string
  title: string
  year: number
  medium: string
  dimensions: string
  price: number
  status: ArtworkStatus
  image: string
  fallback: string | null
  story: string
}

/** Created on first start when missing (the app's login needs permission to create tables). */
const SCHEMA = [
  `IF OBJECT_ID(N'dbo.artworks', N'U') IS NULL
   CREATE TABLE dbo.artworks (
     id          NVARCHAR(200)  NOT NULL PRIMARY KEY,
     title       NVARCHAR(300)  NOT NULL,
     year        INT            NOT NULL,
     medium      NVARCHAR(300)  NOT NULL,
     dimensions  NVARCHAR(100)  NOT NULL,
     price       INT            NOT NULL CONSTRAINT ck_artworks_price CHECK (price > 0),
     status      NVARCHAR(20)   NOT NULL CONSTRAINT ck_artworks_status CHECK (status IN ('available', 'reserved', 'sold')),
     image       NVARCHAR(500)  NOT NULL,
     fallback    NVARCHAR(500)  NULL,
     story       NVARCHAR(MAX)  NOT NULL,
     sort_order  INT            NOT NULL,
     created_at  DATETIME2(0)   NOT NULL CONSTRAINT df_artworks_created DEFAULT SYSUTCDATETIME(),
     updated_at  DATETIME2(0)   NOT NULL CONSTRAINT df_artworks_updated DEFAULT SYSUTCDATETIME()
   )`,
  `IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
   CREATE TABLE dbo.orders (
     number      NVARCHAR(20)   NOT NULL PRIMARY KEY,
     status      NVARCHAR(20)   NOT NULL CONSTRAINT df_orders_status DEFAULT 'new'
                                CONSTRAINT ck_orders_status CHECK (status IN ('new', 'paid', 'shipped', 'cancelled')),
     name        NVARCHAR(200)  NOT NULL,
     email       NVARCHAR(320)  NOT NULL,
     address     NVARCHAR(500)  NOT NULL,
     city        NVARCHAR(200)  NOT NULL,
     postcode    NVARCHAR(40)   NOT NULL,
     country     NVARCHAR(100)  NOT NULL,
     total       INT            NOT NULL,
     created_at  DATETIME2(0)   NOT NULL CONSTRAINT df_orders_created DEFAULT SYSUTCDATETIME(),
     updated_at  DATETIME2(0)   NOT NULL CONSTRAINT df_orders_updated DEFAULT SYSUTCDATETIME()
   )`,
  // No foreign key to artworks: an order keeps its record even if the painting is later removed.
  `IF OBJECT_ID(N'dbo.order_items', N'U') IS NULL
   CREATE TABLE dbo.order_items (
     order_number  NVARCHAR(20)   NOT NULL CONSTRAINT fk_order_items_order REFERENCES dbo.orders (number),
     artwork_id    NVARCHAR(200)  NOT NULL,
     title         NVARCHAR(300)  NOT NULL,
     price         INT            NOT NULL,
     CONSTRAINT pk_order_items PRIMARY KEY (order_number, artwork_id)
   )`,
]

const COLUMNS = 'id, title, year, medium, dimensions, price, status, image, fallback, story'

/** SQL Server types of the painting fields, for parameters. */
const FIELD_TYPES = {
  title: sql.NVarChar(300),
  year: sql.Int,
  medium: sql.NVarChar(300),
  dimensions: sql.NVarChar(100),
  price: sql.Int,
  status: sql.NVarChar(20),
  story: sql.NVarChar(sql.MAX),
  image: sql.NVarChar(500),
} as const
type FieldKey = keyof typeof FIELD_TYPES
const FIELD_KEYS = Object.keys(FIELD_TYPES) as FieldKey[]

const toArtwork = ({ fallback, ...row }: ArtworkRow): Artwork => (fallback ? { ...row, fallback } : row)

/** Thrown when some of the requested paintings can no longer be bought. */
export class UnavailableError extends Error {
  readonly ids: string[]
  constructor(ids: string[]) {
    super('Some paintings are no longer available')
    this.ids = ids
  }
}

/** Thrown when an order can't move to the requested status (e.g. a shipped order can't be cancelled). */
export class StatusChangeError extends Error {
  readonly from: OrderStatus
  readonly allowed: OrderStatus[]
  constructor(from: OrderStatus) {
    super(`A ${from} order can't change to that status`)
    this.from = from
    this.allowed = ORDER_STATUS_NEXT[from]
  }
}

// SQL Server error numbers.
const OBJECT_EXISTS = 2714 // a table another process created at the same moment
const DUPLICATE_KEY = 2627

const errorNumber = (err: unknown) => (err as { number?: number }).number

/** Adds @p0, @p1... for a list of ids and returns the placeholder list for IN (...). */
function inputIds(request: sql.Request, ids: string[]) {
  ids.forEach((id, i) => request.input(`p${i}`, sql.NVarChar(200), id))
  return ids.map((_, i) => `@p${i}`).join(', ')
}

/** Runs `fn` in a transaction, committing on success and rolling back on any error. */
async function inTransaction<T>(pool: sql.ConnectionPool, fn: (request: () => sql.Request) => Promise<T>) {
  const tx = new sql.Transaction(pool)
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
  try {
    const result = await fn(() => new sql.Request(tx))
    await tx.commit()
    return result
  } catch (err) {
    await tx.rollback().catch(() => {})
    throw err
  }
}

/** Opens a connection pool to SQL Server (SQL Server authentication). */
export async function connect(settings: DatabaseSettings) {
  const pool = new sql.ConnectionPool({
    server: settings.server,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    connectionTimeout: 20_000,
    requestTimeout: 30_000,
    options: { encrypt: settings.encrypt, trustServerCertificate: settings.trustServerCertificate },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  })
  pool.on('error', (err) => console.error('SQL Server connection error', err))
  await pool.connect()
  return pool
}

/** Creates any missing tables. */
export async function createSchema(pool: sql.ConnectionPool) {
  for (const statement of SCHEMA) {
    try {
      await pool.request().batch(statement)
    } catch (err) {
      if (errorNumber(err) !== OBJECT_EXISTS) throw err
    }
  }
}

/** Inserts one painting with all its fields, at the given position. */
export function insertArtwork(request: sql.Request, a: Artwork, sortOrder: number) {
  request.input('id', sql.NVarChar(200), a.id).input('fallback', sql.NVarChar(500), a.fallback ?? null).input('sort', sql.Int, sortOrder)
  for (const k of FIELD_KEYS) request.input(k, FIELD_TYPES[k], a[k])
  return request.query(`INSERT INTO dbo.artworks (${COLUMNS}, sort_order)
                        VALUES (@id, @title, @year, @medium, @dimensions, @price, @status, @image, @fallback, @story, @sort)`)
}

/** Loads the original paintings when the collection is empty (first start). */
export async function seedIfEmpty(pool: sql.ConnectionPool) {
  await inTransaction(pool, async (request) => {
    const { recordset } = await request().query<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.artworks WITH (TABLOCKX, HOLDLOCK)')
    if (recordset[0].n > 0) return
    for (const [i, a] of seedArtworks.entries()) await insertArtwork(request(), a, i)
  })
}

export type Repository = Awaited<ReturnType<typeof openRepository>>

/** Connects to SQL Server, creates the tables if missing, and loads the original paintings into an empty collection. */
export async function openRepository(settings: DatabaseSettings) {
  const pool = await connect(settings)
  try {
    await createSchema(pool)
    await seedIfEmpty(pool)
  } catch (err) {
    await pool.close().catch(() => {})
    throw err
  }

  const get = async (id: string) => {
    const { recordset } = await pool.request().input('id', sql.NVarChar(200), id).query<ArtworkRow>(`SELECT ${COLUMNS} FROM dbo.artworks WHERE id = @id`)
    return recordset[0] && toArtwork(recordset[0])
  }

  const orderSummaries = async (number?: string): Promise<OrderSummary[]> => {
    const where = number ? 'WHERE o.number = @number' : ''
    const orders = pool.request()
    const items = pool.request()
    if (number) {
      orders.input('number', sql.NVarChar(20), number)
      items.input('number', sql.NVarChar(20), number)
    }
    const [{ recordset: rows }, { recordset: itemRows }] = await Promise.all([
      orders.query<{ number: string; status: OrderStatus; total: number; created_at: Date; updated_at: Date } & Customer>(
        `SELECT o.number, o.status, o.total, o.created_at, o.updated_at, o.name, o.email, o.address, o.city, o.postcode, o.country
         FROM dbo.orders o ${where} ORDER BY o.created_at DESC, o.number DESC`,
      ),
      items.query<{ order_number: string; artwork_id: string; title: string; price: number }>(
        `SELECT i.order_number, i.artwork_id, i.title, i.price FROM dbo.order_items i
         JOIN dbo.orders o ON o.number = i.order_number ${where} ORDER BY i.title`,
      ),
    ])
    return rows.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total,
      createdAt: o.created_at.toISOString(),
      updatedAt: o.updated_at.toISOString(),
      customer: { name: o.name, email: o.email, address: o.address, city: o.city, postcode: o.postcode, country: o.country },
      items: itemRows
        .filter((i) => i.order_number === o.number)
        .map((i) => ({ artworkId: i.artwork_id, title: i.title, price: i.price })),
    }))
  }

  return {
    async list() {
      const { recordset } = await pool.request().query<ArtworkRow>(`SELECT ${COLUMNS} FROM dbo.artworks ORDER BY sort_order, created_at`)
      return recordset.map(toArtwork)
    },

    get,

    /** Adds a painting at the top of the collection. */
    async create(id: string, fields: ArtworkFields, image: string): Promise<Artwork> {
      const request = pool.request().input('id', sql.NVarChar(200), id)
      for (const k of FIELD_KEYS) request.input(k, FIELD_TYPES[k], k === 'image' ? image : fields[k])
      await request.query(`
        INSERT INTO dbo.artworks (${COLUMNS}, sort_order)
        SELECT @id, @title, @year, @medium, @dimensions, @price, @status, @image, NULL, @story,
               COALESCE((SELECT MIN(sort_order) FROM dbo.artworks), 0) - 1`)
      return (await get(id))!
    },

    /** Updates the given fields (and image); returns undefined if the painting does not exist. */
    async update(id: string, fields: Partial<ArtworkFields> & { image?: string }): Promise<Artwork | undefined> {
      // Keys come from validated fields only, never straight from a request.
      const keys = FIELD_KEYS.filter((k) => fields[k] !== undefined)
      if (keys.length > 0) {
        const request = pool.request().input('id', sql.NVarChar(200), id)
        for (const k of keys) request.input(k, FIELD_TYPES[k], fields[k])
        await request.query(`UPDATE dbo.artworks SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = SYSUTCDATETIME() WHERE id = @id`)
      }
      return get(id)
    },

    /** Deletes a painting and returns it, or undefined if it did not exist. */
    async remove(id: string): Promise<Artwork | undefined> {
      const deleted = COLUMNS.split(', ').map((c) => `DELETED.${c}`).join(', ')
      const { recordset } = await pool.request().input('id', sql.NVarChar(200), id).query<ArtworkRow>(`DELETE FROM dbo.artworks OUTPUT ${deleted} WHERE id = @id`)
      return recordset[0] && toArtwork(recordset[0])
    },

    /**
     * Records an order (status New) and marks its paintings sold, all or nothing. The paintings are
     * locked while it runs, so two customers can't buy the same one.
     * Throws UnavailableError if any painting is missing or not available.
     */
    placeOrder(ids: string[], customer: Customer): Promise<Order> {
      return inTransaction(pool, async (request) => {
        const select = request()
        const { recordset } = await select.query<ArtworkRow>(
          `SELECT ${COLUMNS} FROM dbo.artworks WITH (UPDLOCK, HOLDLOCK) WHERE id IN (${inputIds(select, ids)})`,
        )
        const works = ids.map((id) => recordset.find((a) => a.id === id))
        const unavailable = ids.filter((_, i) => works[i]?.status !== 'available')
        if (unavailable.length > 0) throw new UnavailableError(unavailable)

        const items = (works as ArtworkRow[]).map(toArtwork)
        const total = items.reduce((sum, a) => sum + a.price, 0)
        let number = ''
        for (let attempt = 0; !number; attempt++) {
          const candidate = `AT-${Math.floor(10000 + Math.random() * 90000)}`
          const insert = request().input('number', sql.NVarChar(20), candidate).input('total', sql.Int, total)
          for (const k of ['name', 'email', 'address', 'city', 'postcode', 'country'] as const) insert.input(k, sql.NVarChar(500), customer[k])
          try {
            await insert.query(`INSERT INTO dbo.orders (number, name, email, address, city, postcode, country, total)
                                VALUES (@number, @name, @email, @address, @city, @postcode, @country, @total)`)
            number = candidate
          } catch (err) {
            if (errorNumber(err) !== DUPLICATE_KEY || attempt > 20) throw err
          }
        }
        for (const a of items) {
          await request()
            .input('number', sql.NVarChar(20), number)
            .input('id', sql.NVarChar(200), a.id)
            .input('title', sql.NVarChar(300), a.title)
            .input('price', sql.Int, a.price)
            .query('INSERT INTO dbo.order_items (order_number, artwork_id, title, price) VALUES (@number, @id, @title, @price)')
        }
        const sell = request()
        await sell.query(`UPDATE dbo.artworks SET status = 'sold', updated_at = SYSUTCDATETIME() WHERE id IN (${inputIds(sell, ids)})`)
        return { number, total, items: items.map((a) => ({ ...a, status: 'sold' as const })) }
      })
    },

    /** Every order, newest first, with customer details and items. */
    listOrders: () => orderSummaries(),

    /**
     * Moves an order to a new status (see ORDER_STATUS_NEXT). Cancelling puts its paintings back
     * on sale. Returns undefined if the order doesn't exist; throws StatusChangeError if not allowed.
     */
    async setOrderStatus(number: string, status: OrderStatus): Promise<OrderSummary | undefined> {
      const found = await inTransaction(pool, async (request) => {
        const { recordset } = await request()
          .input('number', sql.NVarChar(20), number)
          .query<{ status: OrderStatus }>('SELECT status FROM dbo.orders WITH (UPDLOCK, HOLDLOCK) WHERE number = @number')
        const current = recordset[0]?.status
        if (!current) return false
        if (current === status) return true
        if (!ORDER_STATUS_NEXT[current].includes(status)) throw new StatusChangeError(current)
        await request()
          .input('number', sql.NVarChar(20), number)
          .input('status', sql.NVarChar(20), status)
          .query('UPDATE dbo.orders SET status = @status, updated_at = SYSUTCDATETIME() WHERE number = @number')
        if (status === 'cancelled') {
          await request()
            .input('number', sql.NVarChar(20), number)
            .query(`UPDATE dbo.artworks SET status = 'available', updated_at = SYSUTCDATETIME()
                    WHERE status = 'sold' AND id IN (SELECT artwork_id FROM dbo.order_items WHERE order_number = @number)`)
        }
        return true
      })
      return found ? (await orderSummaries(number))[0] : undefined
    },

    /** The connection pool, for scripts (migration, connection check) and tests. */
    pool,

    close: () => pool.close(),
  }
}
