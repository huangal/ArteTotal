import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CheckCircle, X } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { formatPrice, scrollToSection } from '../lib/format'
import { ApiError } from '../lib/api'
import type { Customer, Order } from '../types'
import { ArtImage } from './ArtImage'
import { Field } from './Field'
import { inputClass } from '../lib/ui'

type Step = 'cart' | 'details' | 'review' | 'done'
const STEPS: { id: Step; label: string }[] = [
  { id: 'cart', label: 'Cart' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review' },
]

type Details = Customer
const EMPTY: Details = { name: '', email: '', address: '', city: '', postcode: '', country: '' }

const ease = [0.16, 1, 0.3, 1] as const
const primary =
  'inline-flex h-12 w-full items-center justify-center bg-ink px-6 text-[13px] font-medium tracking-wide text-paper transition-[background-color,transform] duration-300 hover:bg-ink-2 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70'

export function CartDrawer() {
  const { artworks, cart, cartOpen, setCartOpen, removeFromCart, completePurchase } = useStore()
  const [step, setStep] = useState<Step>('cart')
  const [details, setDetails] = useState<Details>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({})
  const [placing, setPlacing] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const total = cart.reduce((sum, a) => sum + a.price, 0)

  const close = () => {
    setCartOpen(false)
    setOrderError(null)
    if (step === 'done') {
      setStep('cart')
      setOrder(null)
      setDetails(EMPTY)
    }
  }

  useEffect(() => {
    if (!cartOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCartOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cartOpen, setCartOpen])

  // If the cart empties mid-checkout (item removed), fall back to the cart view.
  const view: Step = step !== 'done' && cart.length === 0 ? 'cart' : step

  const submitDetails = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    ;(Object.keys(EMPTY) as (keyof Details)[]).forEach((k) => {
      if (!details[k].trim()) next[k] = 'Required'
    })
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length === 0) setStep('review')
  }

  const placeOrder = async () => {
    setPlacing(true)
    setOrderError(null)
    // No payment is taken yet. At launch, charge through a payment provider before placing the order.
    try {
      setOrder(await completePurchase(details))
      setStep('done')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.fields)
        setStep('details')
      } else if (err instanceof ApiError && err.status === 409) {
        const titles = err.unavailable.map((id) => artworks.find((a) => a.id === id)?.title ?? 'A painting')
        setOrderError(`${titles.join(', ')} ${titles.length === 1 ? 'is' : 'are'} no longer available and left your cart.`)
      } else {
        setOrderError(err instanceof Error ? err.message : 'The order could not be placed. Try again.')
      }
    } finally {
      setPlacing(false)
    }
  }

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDetails((d) => ({ ...d, [k]: e.target.value }))
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }))
  }

  return (
    <AnimatePresence>
      {cartOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Cart and checkout">
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.7, ease }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col bg-paper"
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6 md:h-[72px]">
              {view === 'done' ? (
                <span className="font-serif text-2xl">Order confirmed</span>
              ) : (
                <ol className="flex gap-5 text-[13px]">
                  {STEPS.map((s, i) => {
                    const current = STEPS.findIndex((x) => x.id === view)
                    return (
                      <li key={s.id} className={i === current ? 'text-ink' : i < current ? 'text-ink-2' : 'text-ink-3'}>
                        {i === current ? <span className="border-b border-ink pb-1">{s.label}</span> : s.label}
                      </li>
                    )
                  })}
                </ol>
              )}
              <button type="button" onClick={close} aria-label="Close cart" className="grid size-10 place-items-center hover:opacity-60">
                <X size={22} weight="light" />
              </button>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease }}
                className="flex min-h-0 flex-1 flex-col"
              >
                {view === 'cart' && (
                  <>
                    <div className="flex-1 overflow-y-auto px-6 py-8">
                      {cart.length === 0 ? (
                        <div className="flex h-full flex-col items-start justify-center">
                          <p className="font-serif text-3xl font-light">Your cart is empty.</p>
                          <p className="mt-3 max-w-[32ch] text-[14px] text-ink-3">
                            Available paintings can be added from the shop or from any painting's detail view.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              close()
                              scrollToSection('shop')
                            }}
                            className="mt-8 text-[14px] underline underline-offset-4"
                          >
                            Shop available works
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-8">
                          <AnimatePresence initial={false}>
                            {cart.map((a) => (
                              <motion.li
                                key={a.id}
                                layout
                                exit={{ opacity: 0, x: 40 }}
                                transition={{ duration: 0.4, ease }}
                                className="grid grid-cols-[96px_1fr] gap-5"
                              >
                                <div className="grid aspect-[4/5] place-items-center bg-wall p-2.5">
                                  <ArtImage artwork={a} className="max-h-full max-w-full object-contain" />
                                </div>
                                <div className="flex flex-col">
                                  <p className="font-serif text-xl leading-tight italic">{a.title}</p>
                                  <p className="mt-1 text-[13px] text-ink-3">
                                    {a.medium}, {a.dimensions}
                                  </p>
                                  <div className="mt-auto flex items-baseline justify-between pt-3">
                                    <button type="button" onClick={() => removeFromCart(a.id)} className="text-[13px] text-ink-3 underline underline-offset-4 hover:text-ink">
                                      Remove
                                    </button>
                                    <span className="tabular-nums">{formatPrice(a.price)}</span>
                                  </div>
                                </div>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                        </ul>
                      )}
                    </div>
                    {cart.length > 0 && (
                      <footer className="border-t border-line px-6 py-6">
                        <Summary total={total} />
                        <button type="button" onClick={() => setStep('details')} className={`${primary} mt-6`}>
                          Continue to checkout
                        </button>
                      </footer>
                    )}
                  </>
                )}

                {view === 'details' && (
                  <form onSubmit={submitDetails} noValidate className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-8">
                      <BackButton onClick={() => setStep('cart')} />
                      <p className="font-serif text-3xl font-light">Where should the work go?</p>
                      <Field label="Full name" error={errors.name}>
                        {(p) => <input {...p} autoComplete="name" value={details.name} onChange={set('name')} className={inputClass(p)} />}
                      </Field>
                      <Field label="Email" error={errors.email} hint="We'll send the confirmation and delivery details here.">
                        {(p) => <input {...p} type="email" autoComplete="email" value={details.email} onChange={set('email')} className={inputClass(p)} />}
                      </Field>
                      <Field label="Street address" error={errors.address}>
                        {(p) => <input {...p} autoComplete="street-address" value={details.address} onChange={set('address')} className={inputClass(p)} />}
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="City" error={errors.city}>
                          {(p) => <input {...p} autoComplete="address-level2" value={details.city} onChange={set('city')} className={inputClass(p)} />}
                        </Field>
                        <Field label="Postcode" error={errors.postcode}>
                          {(p) => <input {...p} autoComplete="postal-code" value={details.postcode} onChange={set('postcode')} className={inputClass(p)} />}
                        </Field>
                      </div>
                      <Field label="Country" error={errors.country}>
                        {(p) => <input {...p} autoComplete="country-name" value={details.country} onChange={set('country')} className={inputClass(p)} />}
                      </Field>
                    </div>
                    <footer className="border-t border-line px-6 py-6">
                      <button type="submit" className={primary}>
                        Review order
                      </button>
                    </footer>
                  </form>
                )}

                {view === 'review' && (
                  <>
                    <div className="flex-1 overflow-y-auto px-6 py-8">
                      <BackButton onClick={() => setStep('details')} />
                      <p className="font-serif text-3xl font-light">Review your order</p>
                      <ul className="mt-8 space-y-3 text-[14px]">
                        {cart.map((a) => (
                          <li key={a.id} className="flex justify-between gap-4">
                            <span className="font-serif text-lg italic">{a.title}</span>
                            <span className="tabular-nums">{formatPrice(a.price)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-8 bg-wall p-5 text-[14px] leading-relaxed">
                        <p className="text-ink">{details.name}</p>
                        <p className="text-ink-2">
                          {details.address}, {details.city} {details.postcode}, {details.country}
                        </p>
                        <p className="text-ink-2">{details.email}</p>
                      </div>
                      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
                        This is a demonstration checkout, so no payment is taken. At launch, payment is handled by a secure payment provider.
                      </p>
                    </div>
                    <footer className="border-t border-line px-6 py-6">
                      <Summary total={total} />
                      {orderError && (
                        <p role="alert" className="mt-4 text-[13px] text-danger">
                          {orderError}
                        </p>
                      )}
                      <button type="button" onClick={placeOrder} disabled={placing} className={`${primary} mt-6`}>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span key={placing ? 'placing' : 'place'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {placing ? 'Placing order...' : `Place order, ${formatPrice(total)}`}
                          </motion.span>
                        </AnimatePresence>
                      </button>
                    </footer>
                  </>
                )}

                {view === 'done' && order && (
                  <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-10">
                    <div>
                      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 18 }}>
                        <CheckCircle size={44} weight="thin" className="text-accent" />
                      </motion.div>
                      <p className="mt-6 font-serif text-4xl font-light">Thank you, {details.name.split(' ')[0]}.</p>
                      <p className="mt-4 max-w-[38ch] text-[15px] leading-relaxed text-ink-2">
                        Order {order.number} is confirmed. The studio will email {details.email} within two working days to arrange delivery.
                      </p>
                      <ul className="mt-10 space-y-4">
                        {order.items.map((a) => (
                          <li key={a.id} className="grid grid-cols-[64px_1fr] items-center gap-4">
                            <div className="grid aspect-square place-items-center bg-wall p-1.5">
                              <ArtImage artwork={a} className="max-h-full max-w-full object-contain" />
                            </div>
                            <div>
                              <p className="font-serif text-lg italic">{a.title}</p>
                              <p className="text-[13px] text-ink-3">Now in your collection</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button type="button" onClick={close} className={`${primary} mt-10`}>
                      Continue browsing
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

function Summary({ total }: { total: number }) {
  return (
    <dl className="space-y-2 text-[14px]">
      <div className="flex justify-between text-ink-3">
        <dt>Insured shipping</dt>
        <dd>Quoted after purchase</dd>
      </div>
      <div className="flex justify-between text-base">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatPrice(total)}</dd>
      </div>
    </dl>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 inline-flex items-center gap-2 text-[13px] text-ink-3 hover:text-ink">
      <ArrowLeft size={14} weight="light" />
      Back
    </button>
  )
}
