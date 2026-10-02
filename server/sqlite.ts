import { copyFileSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** The calls the repository uses: node:sqlite's API, which the sql.js adapter below copies. */
export interface Statement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}
export interface Database {
  exec(sql: string): unknown
  prepare(sql: string): Statement
  close(): unknown
}

interface SqlJsStatement {
  bind(values: unknown): boolean
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): boolean
}
interface SqlJsDatabase {
  run(sql: string, params?: unknown): unknown
  exec(sql: string): unknown
  prepare(sql: string): SqlJsStatement
  export(): Uint8Array
  close(): void
}
interface SqlJs {
  Database: new (data?: Uint8Array) => SqlJsDatabase
}
type InitSqlJs = (config: { locateFile: (file: string) => string }) => Promise<SqlJs>

const load = createRequire(import.meta.url)

function loadBuiltin() {
  try {
    return load('node:sqlite') as { DatabaseSync: new (file: string) => Database }
  } catch {
    return undefined // Node before 22.5
  }
}

/**
 * sql.js is SQLite compiled to WebAssembly: no native build and nothing to install, so it runs on
 * any host (e.g. Node 18 on Windows/IIS). The deploy package ships it in server/vendor;
 * in development it comes from node_modules.
 */
async function loadSqlJs() {
  for (const id of ['./vendor/sql-wasm.cjs', 'sql.js/dist/sql-wasm.js']) {
    let path: string
    try {
      path = load.resolve(id)
    } catch {
      continue
    }
    return (load(path) as InitSqlJs)({ locateFile: (file) => join(dirname(path), file) })
  }
  throw new Error('No SQLite available: this needs Node 22.5+ (node:sqlite) or sql.js')
}

const builtin = loadBuiltin()
const sqlJs = builtin ? undefined : await loadSqlJs()

/** Names the engine in use, for the startup log. */
export const sqliteEngine = builtin ? 'node:sqlite' : 'sql.js'

/** Opens a SQLite database file (or ':memory:') with node:sqlite when available, otherwise sql.js. */
export function openDatabase(file: string): Database {
  return builtin ? new builtin.DatabaseSync(file) : openSqlJs(sqlJs!, file)
}

/**
 * sql.js keeps the database in memory, so this writes the whole file after every change
 * (outside a transaction, or on COMMIT). Fine for a small collection with few writes.
 * Before each statement it reloads the file if another process changed it (e.g. while IIS
 * recycles the app, old and new processes briefly overlap), so no process writes over newer data.
 */
function openSqlJs(SQL: SqlJs, file: string): Database {
  const persist = file !== ':memory:'
  let db = new SQL.Database()
  let version = '' // mtime and size of the file as last read or written by this process
  let inTransaction = false

  const fileVersion = () => {
    try {
      const { mtimeMs, size } = statSync(file)
      return `${mtimeMs}:${size}`
    } catch {
      return '' // not created yet
    }
  }
  const reload = () => {
    if (!persist || inTransaction) return
    const current = fileVersion()
    if (current === version) return
    if (current) {
      db.close()
      db = new SQL.Database(readFileSync(file))
      db.exec('PRAGMA foreign_keys = ON')
    }
    version = current
  }
  const save = () => {
    if (!persist || inTransaction) return
    // Write a temporary file, then swap it in, so a crash mid-write can't corrupt the database.
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, db.export())
    try {
      renameSync(tmp, file)
    } catch (err) {
      // On Windows the swap can be blocked while another program (e.g. antivirus) has the file open.
      if (!['EPERM', 'EACCES', 'EBUSY'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err
      copyFileSync(tmp, file)
      unlinkSync(tmp)
    }
    version = fileVersion()
    db.exec('PRAGMA foreign_keys = ON') // export() reopens the database, which resets pragmas
  }
  reload()

  // node:sqlite takes { name: value } for :name parameters; sql.js wants the ':' in the key.
  const params = (args: unknown[]) => {
    const [first] = args
    if (args.length === 1 && first !== null && typeof first === 'object' && !Array.isArray(first)) {
      return Object.fromEntries(Object.entries(first).map(([k, v]) => [`:${k}`, v ?? null]))
    }
    return args.map((v) => v ?? null)
  }

  return {
    exec(sql) {
      reload()
      db.exec(sql)
      const command = sql.trim().split(/\s+/)[0].toUpperCase()
      if (command === 'BEGIN') {
        inTransaction = true
      } else if (command === 'COMMIT' || command === 'ROLLBACK') {
        inTransaction = false
        if (command === 'COMMIT') save()
      } else {
        save()
      }
    },

    prepare(sql) {
      const query = (args: unknown[], limit = Infinity) => {
        reload()
        const rows: Record<string, unknown>[] = []
        const statement = db.prepare(sql)
        try {
          statement.bind(params(args))
          while (rows.length < limit && statement.step()) rows.push(statement.getAsObject())
        } finally {
          statement.free()
        }
        return rows
      }
      return {
        run(...args) {
          reload()
          db.run(sql, params(args))
          save()
          return undefined
        },
        get: (...args) => query(args, 1)[0],
        all: (...args) => query(args),
      }
    },

    // Every change is saved as it happens, so closing writes nothing (and can't overwrite newer data).
    close: () => db.close(),
  }
}
