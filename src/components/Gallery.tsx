import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { ArtImage } from './ArtImage'
import { StatusLabel } from './StatusLabel'

/**
 * Exhibition hang: pairs of works share a row on a 12-column wall, with
 * different widths and drop offsets so no two rows read the same.
 * Collapses to two columns on tablets and one on phones.
 */
const HANG = [
  'lg:col-span-7',
  'lg:col-start-9 lg:col-span-4 lg:mt-40',
  'lg:col-start-2 lg:col-span-4 lg:mt-10',
  'lg:col-start-7 lg:col-span-6',
  'lg:col-start-1 lg:col-span-5 lg:mt-28',
  'lg:col-start-7 lg:col-span-4',
]

export function Gallery() {
  const { artworks, collection, reloadCollection, openArtwork, openStudio } = useStore()

  return (
    <section id="gallery" className="mx-auto max-w-[1440px] scroll-mt-16 px-4 py-24 md:px-10 md:py-40">
      <div className="mb-16 flex items-end justify-between gap-6 md:mb-28">
        <h2 className="font-serif text-5xl leading-[1.05] font-light tracking-[-0.02em] md:text-7xl">
          The collection
        </h2>
        {collection === 'ready' && <p className="pb-2 text-[14px] text-ink-3 tabular-nums">{artworks.length} works</p>}
      </div>

      {collection === 'loading' ? (
        <div aria-busy="true" className="grid place-items-center border border-dashed border-line py-32 text-center">
          <p className="text-[14px] text-ink-3">Hanging the collection...</p>
        </div>
      ) : collection === 'error' ? (
        <div role="alert" className="grid place-items-center border border-dashed border-line py-32 text-center">
          <p className="font-serif text-3xl">The collection couldn't be loaded.</p>
          <button type="button" onClick={reloadCollection} className="mt-6 text-[14px] underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : artworks.length === 0 ? (
        <div className="grid place-items-center border border-dashed border-line py-32 text-center">
          <p className="font-serif text-3xl">The walls are bare for now.</p>
          <button type="button" onClick={() => openStudio()} className="mt-6 text-[14px] underline underline-offset-4">
            Add a painting in the Studio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-x-8 gap-y-16 md:grid-cols-2 md:gap-y-24 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-40">
          <AnimatePresence initial={false}>
            {artworks.map((art, i) => (
              <motion.article
                key={art.id}
                layout
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], layout: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }}
                className={`${HANG[i % HANG.length]} ${i % 2 === 1 ? 'md:mt-24 lg:mt-0' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => openArtwork(art.id)}
                  className="group block w-full text-left"
                  aria-label={`View ${art.title}`}
                >
                  <div className="overflow-hidden bg-wall p-5 md:p-8">
                    <ArtImage
                      artwork={art}
                      loading="lazy"
                      className="mx-auto h-auto max-h-[78vh] w-auto max-w-full shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)] transition-transform duration-[1.1s] ease-gallery group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-[22px] leading-tight italic">
                        {art.title}
                        <span className="not-italic text-ink-3">, {art.year}</span>
                      </h3>
                      <p className="mt-1 text-[13px] text-ink-3">
                        {art.medium}, {art.dimensions}
                      </p>
                    </div>
                    <StatusLabel status={art.status} className="shrink-0 pt-1.5" />
                  </div>
                </button>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
