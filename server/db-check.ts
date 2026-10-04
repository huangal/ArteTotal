/**
 * Checks the SQL Server connection in artetotal.settings.json, without changing anything:
 *   npm run db:check
 * Prints the server version, whether the login can create tables, and what the database holds.
 */
import { checkDatabaseSettings, loadSettings } from './config.ts'
import { connect } from './db.ts'

const settings = loadSettings()
const db = settings.database
console.log(`Settings: ${settings.file ?? 'none found (using environment variables)'}`)
checkDatabaseSettings(settings)
console.log(`Connecting to ${db.server}:${db.port}, database ${db.database}, as ${db.user} (encrypt: ${db.encrypt})...`)

let pool
try {
  pool = await connect(db)
} catch (err) {
  const e = err as Error & { code?: string }
  console.error(`\nCouldn't connect: ${e.code ?? ''} ${e.message}`)
  if (e.code === 'ELOGIN') console.error('Check the user name and password, and that the login may use this database.')
  if (e.code === 'ESOCKET' || e.code === 'ETIMEOUT') {
    console.error("Check the server name and port, and that the host allows remote connections from this computer's IP address.")
  }
  if (/certificate|ssl|tls/i.test(e.message)) console.error('Try "encrypt": false in the database settings if the host says encryption is not supported.')
  process.exit(1)
}

try {
  const { recordset: [info] } = await pool.request().query<{ version: string; edition: string; level: string; db: string }>(
    `SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS version,
            CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)) AS edition,
            CAST(SERVERPROPERTY('ProductLevel') AS NVARCHAR(50)) AS level, DB_NAME() AS db`,
  )
  const major = Number(info.version.split('.')[0])
  const names: Record<number, string> = { 13: '2016', 14: '2017', 15: '2019', 16: '2022', 17: '2025' }
  console.log(`\nConnected. SQL Server ${names[major] ?? `version ${major}`} (${info.version}, ${info.edition}, ${info.level}), database ${info.db}.`)
  if (major < 13) console.warn('This app needs SQL Server 2016 or newer.')

  const { recordset: [perm] } = await pool.request().query<{ canCreate: number }>(
    "SELECT HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS canCreate",
  )
  console.log(perm.canCreate ? 'The login can create tables: the app will create them on first start.' : "The login can't create tables: ask the host to grant CREATE TABLE (db_ddladmin), or create them yourself.")

  const { recordset: tables } = await pool.request().query<{ name: string; rows: number }>(
    `SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
     WHERE t.name IN ('artworks', 'orders', 'order_items') GROUP BY t.name ORDER BY t.name`,
  )
  console.log(tables.length ? `Tables: ${tables.map((t) => `${t.name} (${t.rows} rows)`).join(', ')}` : 'No ArteTotal tables yet.')
} finally {
  await pool.close()
}
