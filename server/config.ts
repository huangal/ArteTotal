import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Connection details for SQL Server (SQL Server authentication: a login and password). */
export interface DatabaseSettings {
  server: string
  port: number
  database: string
  user: string
  password: string
  /** Encrypt the connection. Most hosts accept it; set false only if the host says so. */
  encrypt: boolean
  /** Accept the server's certificate without checking it (common with shared hosting). */
  trustServerCertificate: boolean
}

export interface Settings {
  database: DatabaseSettings
  /** The Artist Studio password. Empty means the Studio is locked: nothing can be changed. */
  studioPassword: string
  /** Where uploaded images are stored. */
  dataDir: string
  /** The settings file that was read, if any (for messages). */
  file?: string
}

/** The settings file name. It sits next to web.config and is never part of a release. */
export const SETTINGS_FILE = 'artetotal.settings.json'

// The app root: the folder above server/ (both in the repo and in the deploy package).
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type FileSettings = { database?: Partial<DatabaseSettings>; studioPassword?: string; dataDir?: string }

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : /^(1|true|yes)$/i.test(value)

/**
 * Reads artetotal.settings.json from the app root (or the file named by ARTETOTAL_SETTINGS),
 * then lets environment variables override any value: DB_SERVER, DB_PORT, DB_NAME, DB_USER,
 * DB_PASSWORD, DB_ENCRYPT, DB_TRUST_SERVER_CERTIFICATE, STUDIO_PASSWORD, DATA_DIR.
 */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const path = env.ARTETOTAL_SETTINGS ? resolve(env.ARTETOTAL_SETTINGS) : join(appRoot, SETTINGS_FILE)
  let fromFile: FileSettings = {}
  if (existsSync(path)) {
    try {
      fromFile = JSON.parse(readFileSync(path, 'utf8')) as FileSettings
    } catch (err) {
      throw new Error(`${path} isn't valid JSON: ${(err as Error).message}`, { cause: err })
    }
  }
  const db = fromFile.database ?? {}
  return {
    database: {
      server: env.DB_SERVER ?? db.server ?? '',
      port: Number(env.DB_PORT ?? db.port ?? 1433),
      database: env.DB_NAME ?? db.database ?? '',
      user: env.DB_USER ?? db.user ?? '',
      password: env.DB_PASSWORD ?? db.password ?? '',
      encrypt: flag(env.DB_ENCRYPT, db.encrypt ?? true),
      trustServerCertificate: flag(env.DB_TRUST_SERVER_CERTIFICATE, db.trustServerCertificate ?? true),
    },
    studioPassword: env.STUDIO_PASSWORD ?? fromFile.studioPassword ?? '',
    dataDir: resolve(appRoot, env.DATA_DIR ?? fromFile.dataDir ?? join('server', 'data')),
    file: existsSync(path) ? path : undefined,
  }
}

/** Throws a readable error if the database settings are incomplete. */
export function checkDatabaseSettings(settings: Settings) {
  const missing = (['server', 'database', 'user', 'password'] as const).filter((k) => !settings.database[k])
  if (missing.length > 0) {
    const where = settings.file ?? `${SETTINGS_FILE} (next to web.config)`
    const error = new Error(`The database settings are incomplete: add ${missing.join(', ')} to ${where}.`)
    Object.assign(error, { code: 'ESETTINGS' })
    throw error
  }
}
