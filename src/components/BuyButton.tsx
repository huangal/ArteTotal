import { AnimatePresence, motion } from 'motion/react'
import { Check, EnvelopeSimple } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import type { Artwork } from '../types'
import { enquiryHref } from '../lib/format'

const base =
  'relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden px-6 text-[13px] font-medium tracking-wide whitespace-nowrap transition-[background-color,color,transform] duration-300 ease-gallery active:scale-[0.98]'

/**
 * Acquire button. Morphs into an "In your cart" state once added, which then
 * opens the cart. Reserved works get an enquiry link instead.
 */
export function BuyButton({ artwork, className = '' }: { artwork: Artwork; className?: string }) {
  const { addToCart, inCart, setCartOpen, closeArtwork, notify } = useStore()
  const added = inCart(artwork.id)

  if (artwork.status === 'sold') {
    return (
      <span className={`${base} border border-line text-ink-3 ${className}`} aria-disabled>
        In Private Collection
      </span>
    )
  }

  if (artwork.status === 'reserved') {
    return (
      <a href={enquiryHref(artwork.title)} className={`${base} border border-ink text-ink hover:bg-ink hover:text-paper ${className}`}>
        <EnvelopeSimple size={16} weight="light" />
        Enquire
      </a>
    )
  }

  return (
    <motion.button
      layout
      type="button"
      onClick={() => {
        if (added) {
          closeArtwork()
          setCartOpen(true)
          return
        }
        addToCart(artwork.id)
        notify(`${artwork.title} is in your cart`)
      }}
      className={`${base} ${added ? 'border border-ink bg-transparent text-ink' : 'bg-ink text-paper hover:bg-ink-2'} ${className}`}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={added ? 'added' : 'buy'}
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2"
        >
          {added ? (
            <>
              <Check size={15} weight="bold" />
              In your cart
            </>
          ) : (
            'Acquire'
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
