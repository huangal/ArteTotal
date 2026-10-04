import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

const COOKIE = 'artetotal_studio'
const SESSION_DAYS = 7
const MAX_FAILURES = 5 // wrong passwords before a pause
const LOCK_MS = 60_000 // first pause; doubles with each further failure, up to an hour

const sha256 = (s: string) => createHash('sha256').update(s).digest()

/** Where a login attempt comes from: IIS forwards the client address in x-forwarded-for. */
const clientKey = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'local'

/** HTTPS requests get a Secure cookie. Behind IIS the app sees http, so also trust its HTTPS markers. */
const isHttps = (c: Context) =>
  new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https' || c.req.header('x-arr-ssl') !== undefined

/**
 * The Artist Studio login: one password (from the settings). A signed, HttpOnly cookie keeps the
 * artist signed in for a week. Changing the password signs every session out.
 */
export function studioAuth(password: string) {
  // The signing key comes from the password, so a new password invalidates old cookies.
  // Signed with node:crypto, not Web Crypto: Node 18 (the host) has no global `crypto` in modules.
  const key = sha256(`artetotal-studio-session:${password}`)
  const sign = (value: string) => createHmac('sha256', key).update(value).digest('base64url')
  const failures = new Map<string, { count: number; lockedUntil: number }>()

  /** The cookie holds "<expiry ms>.<signature>". */
  const isSignedIn = async (c: Context) => {
    if (!password) return false
    const [expires, signature = ''] = (getCookie(c, COOKIE) ?? '').split('.')
    const expected = Buffer.from(sign(expires))
    const given = Buffer.from(signature)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
    return Number(expires) > Date.now()
  }

  /** Checks a password attempt. Returns 'ok', 'wrong', or the seconds to wait before trying again. */
  const attempt = (c: Context, given: string): 'ok' | 'wrong' | number => {
    const client = clientKey(c)
    const record = failures.get(client) ?? { count: 0, lockedUntil: 0 }
    if (record.lockedUntil > Date.now()) return Math.ceil((record.lockedUntil - Date.now()) / 1000)
    // Compare hashes in constant time, so the response time doesn't hint at the password.
    if (password && timingSafeEqual(sha256(given), sha256(password))) {
      failures.delete(client)
      return 'ok'
    }
    record.count += 1
    if (record.count >= MAX_FAILURES) {
      record.lockedUntil = Date.now() + Math.min(LOCK_MS * 2 ** (record.count - MAX_FAILURES), 3_600_000)
    }
    failures.set(client, record)
    if (failures.size > 10_000) failures.clear() // don't grow without bound
    return 'wrong'
  }

  const signIn = (c: Context) => {
    const expires = String(Date.now() + SESSION_DAYS * 86_400_000)
    setCookie(c, COOKIE, `${expires}.${sign(expires)}`, {
      httpOnly: true,
      secure: isHttps(c),
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    })
  }

  const signOut = (c: Context) => deleteCookie(c, COOKIE, { path: '/' })

  /** Only lets signed-in requests through. */
  const required: MiddlewareHandler = async (c, next) => {
    if (await isSignedIn(c)) return next()
    if (!password) {
      return c.json({ error: "The Studio is locked: no Studio password is set in the site's settings." }, 403)
    }
    return c.json({ error: 'Sign in to the Studio first' }, 401)
  }

  return { configured: password !== '', isSignedIn, attempt, signIn, signOut, required }
}

export type StudioAuth = ReturnType<typeof studioAuth>
