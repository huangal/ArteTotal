import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, MagnifyingGlassMinus, MagnifyingGlassPlus, PencilSimple, Trash, X } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { formatPrice } from '../lib/format'
import type { Artwork } from '../types'
import { ArtImage } from './ArtImage'
import { BuyButton } from './BuyButton'
import { StatusLabel } from './StatusLabel'

const ease = [0.16, 1, 0.3, 1] as const

export function ArtworkModal() {
  const { artworks, activeId, openArtwork, closeArtwork } = useStore()
  const index = artworks.findIndex((a) => a.id === activeId)
  const art = index >= 0 ? artworks[index] : null

  return (
    <AnimatePresence>
      {art && (
        <motion.div
          key="artwork-modal"
          role="dialog"
          aria-modal="true"
          aria-label={art.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease }}
          className="fixed inset-0 z-40 bg-paper"
        >
          <ModalBody
            key={art.id}
            art={art}
            index={index}
            total={artworks.length}
            onClose={closeArtwork}
            onStep={(d) => openArtwork(artworks[(index + d + artworks.length) % artworks.length].id)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ModalBody({
  art,
  index,
  total,
  onClose,
  onStep,
}: {
  art: Artwork
  index: number
  total: number
  onClose: () => void
  onStep: (dir: 1 | -1) => void
}) {
  // `art` comes in as a prop, not looked up by index, so the body keeps showing
  // the removed painting while the modal fades out after a removal.
  const { studioOpen, openStudio, removeArtwork, notify, studioSession } = useStore()
  const [zoomed, setZoomed] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    // The Studio opens over the modal to edit; leave the keys to it meanwhile.
    if (studioOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && total > 1) onStep(1)
      if (e.key === 'ArrowLeft' && total > 1) onStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onStep, total, studioOpen])

  // The zoom lens follows the pointer by moving transform-origin directly, outside React renders.
  const followPointer = (e: React.PointerEvent<HTMLElement>) => {
    if (!zoomed || !imgRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    imgRef.current.style.transformOrigin = `${x}% ${y}%`
  }

  const ctrl = 'grid size-11 place-items-center bg-paper/80 text-ink backdrop-blur transition-opacity hover:opacity-70'

  return (
    <div className="grid h-full grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <div className="relative h-[68dvh] bg-wall lg:h-full">
        <button
          type="button"
          onPointerMove={followPointer}
          onClick={() => setZoomed((z) => !z)}
          aria-label={zoomed ? 'Zoom out' : 'Zoom in to see the brushwork'}
          className={`grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden p-6 md:p-14 ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease }}
            className="flex h-full w-full items-center justify-center"
          >
            <ArtImage
              ref={imgRef}
              artwork={art}
              className="max-h-full max-w-full object-contain shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] transition-transform duration-700 ease-gallery"
              style={{ transform: zoomed ? 'scale(2.4)' : 'scale(1)' }}
            />
          </motion.div>
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-4 md:p-6">
          <div className="pointer-events-auto flex gap-2">
            {total > 1 && (
              <>
                <button type="button" onClick={() => onStep(-1)} className={ctrl} aria-label="Previous painting">
                  <ArrowLeft size={18} weight="light" />
                </button>
                <button type="button" onClick={() => onStep(1)} className={ctrl} aria-label="Next painting">
                  <ArrowRight size={18} weight="light" />
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={() => setZoomed((z) => !z)} className={`${ctrl} pointer-events-auto`} aria-label={zoomed ? 'Zoom out' : 'Zoom in'}>
            {zoomed ? <MagnifyingGlassMinus size={18} weight="light" /> : <MagnifyingGlassPlus size={18} weight="light" />}
          </button>
        </div>
      </div>

      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease }}
        className="relative flex flex-col px-6 pt-8 pb-12 md:px-10 lg:overflow-y-auto lg:pt-24"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="fixed top-4 right-4 z-10 grid size-11 place-items-center bg-paper text-ink transition-opacity hover:opacity-60 lg:absolute lg:top-6 lg:right-6"
        >
          <X size={22} weight="light" />
        </button>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">
          <p className="text-ink-3 tabular-nums">
            {index + 1} of {total}
          </p>
          {/* Editing controls are for the signed-in artist only. */}
          {!confirmingRemove && studioSession === 'signed-in' && (
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => openStudio(art.id)}
                className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"
              >
                <PencilSimple size={16} weight="light" /> Edit details
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-danger"
              >
                <Trash size={16} weight="light" /> Remove
              </button>
            </div>
          )}
        </div>
        {confirmingRemove && (
          <div role="group" aria-label="Confirm removal" className="mt-4 border border-line p-4 text-[13px]">
            <p className="text-ink-2">Remove this painting from the collection? It will also leave the cart.</p>
            <div className="mt-4 flex items-center gap-6">
              <button
                type="button"
                disabled={removing}
                onClick={async () => {
                  setRemoving(true)
                  try {
                    await removeArtwork(art.id)
                    notify(`${art.title} was removed from the collection`)
                  } catch (err) {
                    setRemoving(false)
                    notify(err instanceof Error ? err.message : `${art.title} could not be removed`)
                  }
                }}
                className="inline-flex items-center gap-1.5 font-medium text-danger hover:opacity-70 disabled:cursor-wait disabled:opacity-50"
              >
                <Trash size={16} weight="light" /> {removing ? 'Removing...' : 'Remove painting'}
              </button>
              <button type="button" onClick={() => setConfirmingRemove(false)} className="text-ink-3 hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        )}

        <h2 className="mt-3 pb-1 font-serif text-[44px] leading-[1.05] font-light italic">{art.title}</h2>

        <dl className="mt-8 grid grid-cols-3 gap-4 border-y border-line py-5 text-[13px]">
          {[
            ['Medium', art.medium],
            ['Size', art.dimensions],
            ['Year', String(art.year)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-3">{k}</dt>
              <dd className="mt-1 text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex items-center justify-between">
          <StatusLabel status={art.status} />
          {art.status !== 'sold' && <span className="text-xl tabular-nums">{formatPrice(art.price)}</span>}
        </div>
        <BuyButton artwork={art} className="mt-5 w-full" />

        <h3 className="mt-12 font-serif text-2xl">About this painting</h3>
        <p className="mt-4 max-w-[60ch] text-[15px] leading-[1.75] text-ink-2">{art.story}</p>
      </motion.aside>
    </div>
  )
}
