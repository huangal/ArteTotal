import { useState, type FormEvent } from 'react'
import { LockSimple } from '@phosphor-icons/react'
import { ApiError } from '../lib/api'
import { inputClass } from '../lib/ui'
import { useStore } from '../state/store'
import { Field } from './Field'

/** The Studio's sign-in screen: one password, set in the site's settings. */
export function StudioSignIn() {
  const { studioSession, signIn, notify } = useStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setError('Enter the Studio password')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signIn(password)
      setPassword('')
      notify('Signed in to the Studio')
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid flex-1 place-items-center overflow-y-auto px-4 py-16">
      <div className="w-full max-w-sm">
        <LockSimple size={32} weight="thin" />
        <h2 className="mt-5 font-serif text-4xl font-light">Sign in to the Studio</h2>
        {studioSession === 'locked' ? (
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            The Studio is locked because no Studio password is set. Add <code className="text-[13px]">studioPassword</code> to the
            site's settings file (artetotal.settings.json) and restart the site.
          </p>
        ) : studioSession === 'checking' ? (
          <p className="mt-4 text-[15px] text-ink-3">Checking...</p>
        ) : (
          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            <p className="text-[15px] leading-relaxed text-ink-2">
              Adding and editing paintings, and seeing orders, is for the artist only.
            </p>
            <Field label="Studio password" error={error ?? undefined}>
              {(p) => (
                <input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError(null)
                  }}
                  className={inputClass(p)}
                />
              )}
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center bg-ink px-6 text-[13px] font-medium tracking-wide text-paper transition-[background-color,transform] duration-300 hover:bg-ink-2 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
