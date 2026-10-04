import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

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
  const secret = sha256(`artetotal-studio-session:${password}`).toString('base64')
  const failures = new Map<string, { count: number; lockedUntil: number }>()

  const isSignedIn = async (c: Context) => {
    if (!password) return false
    const expires = Number(await getSignedCookie(c, secret, COOKIE))
    return Number.isFinite(expires) && expires > Date.now()
  }

  /** Checks a password attempt. Returns 'ok', 'wrong', or the seconds to wait before trying again. */
  const attempt = (c: Context, given: string): 'ok' | 'wrong' | number => {
    const key = clientKey(c)
    const record = failures.get(key) ?? { count: 0, lockedUntil: 0 }
    if (record.lockedUntil > Date.now()) return Math.ceil((record.lockedUntil - Date.now()) / 1000)
    // Compare hashes in constant time, so the response time doesn't hint at the password.
    if (password && timingSafeEqual(sha256(given), sha256(password))) {
      failures.delete(key)
      return 'ok'
    }
    record.count += 1
    if (record.count >= MAX_FAILURES) {
      record.lockedUntil = Date.now() + Math.min(LOCK_MS * 2 ** (record.count - MAX_FAILURES), 3_600_000)
    }
    failures.set(key, record)
    if (failures.size > 10_000) failures.clear() // don't grow without bound
    return 'wrong'
  }

  const signIn = (c: Context) =>
    setSignedCookie(c, COOKIE, String(Date.now() + SESSION_DAYS * 86_400_000), secret, {
      httpOnly: true,
      secure: isHttps(c),
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    })

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
