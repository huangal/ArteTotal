import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { formatPrice } from '../lib/format'
import { STATUS_LABEL, type ArtworkStatus } from '../types'
import { ArtImage } from './ArtImage'
import { BuyButton } from './BuyButton'
import { StatusLabel } from './StatusLabel'
import { Reveal } from './Reveal'

type Filter = 'all' | ArtworkStatus
const FILTERS: Filter[] = ['available', 'reserved', 'sold', 'all']

export function Shop() {
  const { artworks, openArtwork, openStudio } = useStore()
  const [filter, setFilter] = useState<Filter>('available')
  const rail = useRef<HTMLDivElement>(null)

  const works = filter === 'all' ? artworks : artworks.filter((a) => a.status === filter)
  const count = (f: Filter) => (f === 'all' ? artworks.length : artworks.filter((a) => a.status === f).length)

  const nudge = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section id="shop" className="scroll-mt-16 border-t border-line py-24 md:py-36">
      <div className="mx-auto max-w-[1440px] px-4 md:px-10">
        <Reveal>
          <h2 className="font-serif text-5xl leading-[1.05] font-light tracking-[-0.02em] md:text-7xl">Acquire a work</h2>
          <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
            Prices include a hand-finished frame. Shipping is insured and arranged with you after purchase.
          </p>
        </Reveal>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-6">
          <div role="tablist" aria-label="Filter by availability" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                type="button"
                aria-selected={filter === f}
                onClick={() => {
                  setFilter(f)
                  rail.current?.scrollTo({ left: 0 })
                }}
                className={`relative h-10 shrink-0 px-4 text-[13px] whitespace-nowrap transition-colors duration-300 ${
                  filter === f ? 'text-paper' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {filter === f && (
                  <motion.span layoutId="shop-filter" className="absolute inset-0 bg-ink" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />
                )}
                <span className="relative">
                  {f === 'all' ? 'All works' : STATUS_LABEL[f]} <span className="opacity-60 tabular-nums">{count(f)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="hidden gap-2 md:flex">
            {([-1, 1] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => nudge(d)}
                aria-label={d === -1 ? 'Previous works' : 'Next works'}
                className="grid size-11 place-items-center border border-line transition-colors hover:border-ink"
              >
                {d === -1 ? <ArrowLeft size={18} weight="light" /> : <ArrowRight size={18} weight="light" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={rail}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-4 pb-4 md:gap-10 md:px-[max(2.5rem,calc((100vw-1440px)/2+2.5rem))] md:scroll-px-[max(2.5rem,calc((100vw-1440px)/2+2.5rem))] scroll-px-4"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {works.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid h-[360px] w-full place-items-center border border-dashed border-line text-center"
            >
              <div>
                <p className="font-serif text-3xl">Nothing here at the moment.</p>
                <p className="mt-3 text-[14px] text-ink-3">
                  New paintings appear here as soon as they are added in the{' '}
                  <button type="button" onClick={() => openStudio()} className="underline underline-offset-4">
                    Studio
                  </button>
                  .
                </p>
              </div>
            </motion.div>
          ) : (
            works.map((art) => (
              <motion.article
                key={art.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="w-[80vw] shrink-0 snap-start sm:w-[340px] md:w-[380px]"
              >
                <button
                  type="button"
                  onClick={() => openArtwork(art.id)}
                  aria-label={`View ${art.title}`}
                  className="group grid h-[380px] w-full place-items-center overflow-hidden bg-wall p-7 md:h-[460px]"
                >
                  <ArtImage
                    artwork={art}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)] transition-transform duration-[1.1s] ease-gallery group-hover:scale-[1.04]"
                  />
                </button>
                <div className="mt-5 flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-[22px] leading-tight italic">{art.title}</h3>
                  {art.status !== 'sold' && (
                    <span className="text-[15px] tabular-nums">{formatPrice(art.price)}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-[13px] text-ink-3">
                  <span>
                    {art.dimensions}, {art.year}
                  </span>
                  <StatusLabel status={art.status} />
                </div>
                <BuyButton artwork={art} className="mt-5 w-full" />
              </motion.article>
            ))
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
