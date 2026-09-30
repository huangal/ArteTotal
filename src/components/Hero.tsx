import { motion } from 'motion/react'
import { ArrowDownRight } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { scrollToSection } from '../lib/format'
import { ArtImage } from './ArtImage'

const FLAGSHIP_ID = 'peaches-and-cherries'
const ease = [0.16, 1, 0.3, 1] as const

export function Hero() {
  const { artworks, openArtwork } = useStore()
  const flagship = artworks.find((a) => a.id === FLAGSHIP_ID) ?? artworks[0]

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 1.1, delay, ease },
  })

  return (
    <section id="top" className="mx-auto grid min-h-[100dvh] max-w-[1440px] grid-cols-1 gap-10 px-4 pt-24 pb-12 md:px-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16 lg:pt-28">
      <div className="flex flex-col justify-end lg:pb-24">
        <motion.h1
          {...rise(0.3)}
          className="font-serif text-[44px] leading-[1.04] font-light tracking-[-0.02em] md:text-6xl lg:text-[54px] xl:text-[72px]"
        >
          Paintings of flowers, fruit and the <em className="font-normal">sea.</em>
        </motion.h1>
        <motion.p {...rise(0.45)} className="mt-7 max-w-[40ch] text-[16px] leading-relaxed text-ink-2">
          Original oil paintings by Carlos Huangal. Each work is one of a kind and ships from the studio, framed and insured.
        </motion.p>
        <motion.div {...rise(0.6)} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <button
            type="button"
            onClick={() => scrollToSection('gallery')}
            className="inline-flex h-12 items-center gap-3 bg-ink px-7 text-[13px] font-medium tracking-wide text-paper transition-[background-color,transform] duration-300 hover:bg-ink-2 active:scale-[0.98]"
          >
            View the gallery
            <ArrowDownRight size={16} weight="light" />
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('shop')}
            className="group relative text-[14px] text-ink"
          >
            Shop available works
            <span className="absolute -bottom-1 left-0 h-px w-full bg-ink transition-transform duration-500 ease-gallery group-hover:scale-x-50 origin-left" />
          </button>
        </motion.div>
      </div>

      {flagship ? (
        <figure className="flex flex-col">
          <motion.button
            type="button"
            onClick={() => openArtwork(flagship.id)}
            aria-label={`View ${flagship.title}`}
            initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
            transition={{ duration: 1.5, ease }}
            className="group relative grid h-[62dvh] place-items-center overflow-hidden bg-wall p-6 md:p-10 lg:h-[calc(100dvh-11rem)]"
          >
            <motion.div
              initial={{ scale: 1.12 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.8, ease }}
              className="flex h-full w-full items-center justify-center"
            >
              <ArtImage
                artwork={flagship}
                fetchPriority="high"
                className="max-h-full max-w-full object-contain shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)] transition-transform duration-[1.2s] ease-gallery group-hover:scale-[1.02]"
              />
            </motion.div>
          </motion.button>
          <motion.figcaption
            {...rise(0.9)}
            className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-ink-3 md:grid-cols-4"
          >
            <span className="font-serif text-[17px] text-ink italic">{flagship.title}</span>
            <span>{flagship.medium}</span>
            <span>{flagship.dimensions}</span>
            <span className="md:text-right">{flagship.year}</span>
          </motion.figcaption>
        </figure>
      ) : (
        // Holds the space while the collection loads, so the reveal plays once it arrives.
        <div aria-hidden className="h-[62dvh] bg-wall lg:h-[calc(100dvh-11rem)]" />
      )}
    </section>
  )
}
