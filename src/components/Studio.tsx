import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowCounterClockwise, ImageSquare, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { ApiError } from '../lib/api'
import { scrollToSection } from '../lib/format'
import { inputClass } from '../lib/ui'
import { STATUS_LABEL, type Artwork, type ArtworkStatus } from '../types'
import { ArtImage } from './ArtImage'
import { Field } from './Field'
import { StudioOrders } from './StudioOrders'
import { StudioSignIn } from './StudioSignIn'

const MAX_BYTES = 25 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ease = [0.16, 1, 0.3, 1] as const

interface Form {
  title: string
  year: string
  medium: string
  dimensions: string
  price: string
  status: ArtworkStatus
  story: string
}
type FormErrors = Partial<Record<keyof Form | 'image', string>>

const blank = (): Form => ({
  title: '',
  year: String(new Date().getFullYear()),
  medium: '',
  dimensions: '',
  price: '',
  status: 'available',
  story: '',
})

const fromArtwork = (a: Artwork): Form => ({
  title: a.title,
  year: String(a.year),
  medium: a.medium,
  dimensions: a.dimensions,
  price: String(a.price),
  status: a.status,
  story: a.story,
})

export function Studio() {
  const { artworks, studioOpen, studioEditId, closeStudio, createArtwork, updateArtwork, notify, studioSession, signOut } = useStore()
  const editing = studioEditId ? (artworks.find((a) => a.id === studioEditId) ?? null) : null
  const [form, setForm] = useState<Form>(blank)
  const [errors, setErrors] = useState<FormErrors>({})
  const [image, setImage] = useState<{ url: string; name: string; file: File } | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Object URL of the local preview, revoked once it is replaced, discarded or published.
  const pendingUrl = useRef<string | null>(null)
  // Which painting the form holds: an id, null for a new-painting draft, undefined for neither.
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(null)
  const [view, setView] = useState<'painting' | 'orders'>('painting')

  // Refill the form when the Studio opens for a different painting. A new-painting
  // draft is kept between visits; an edit always starts from the saved details.
  if (studioOpen && loadedFor !== studioEditId) {
    setLoadedFor(studioEditId)
    if (studioEditId) setView('painting')
    setForm(editing ? fromArtwork(editing) : blank())
    setImage(null)
    setErrors({})
    setPublishError(null)
  }

  const signedIn = studioSession === 'signed-in'

  const close = () => {
    closeStudio()
    if (studioEditId) setLoadedFor(undefined)
  }

  useEffect(() => {
    if (!studioOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => () => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
  }, [])

  const discardImage = () => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
    pendingUrl.current = null
    setImage(null)
  }

  const takeFile = async (file?: File) => {
    if (!file) return
    if (!ACCEPT.includes(file.type)) {
      setErrors((e) => ({ ...e, image: 'Use a JPEG, PNG, WebP or AVIF image.' }))
      return
    }
    if (file.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, image: 'That file is over 25 MB. Export a smaller version and try again.' }))
      return
    }
    setLoadingImage(true)
    const url = URL.createObjectURL(file)
    try {
      const probe = new Image()
      probe.src = url
      await probe.decode()
      discardImage()
      pendingUrl.current = url
      setImage({ url, name: file.name, file })
      setErrors((e) => ({ ...e, image: undefined }))
      if (!form.title) {
        const guess = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
        if (guess && !/^\d+$/.test(guess) && !/^(img|dsc)/i.test(guess)) {
          setForm((f) => ({ ...f, title: guess.replace(/\b\w/g, (c) => c.toUpperCase()) }))
        }
      }
    } catch {
      URL.revokeObjectURL(url)
      setErrors((e) => ({ ...e, image: "This image couldn't be read. Try exporting it again." }))
    } finally {
      setLoadingImage(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    takeFile(e.dataTransfer.files[0])
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }))
  }

  const publish = async (e: FormEvent) => {
    e.preventDefault()
    if (publishing) return
    setPublishError(null)
    const next: FormErrors = {}
    if (!image && !editing) next.image = 'Add an image of the painting.'
    if (!form.title.trim()) next.title = 'Required'
    if (!form.medium.trim()) next.medium = 'Required'
    if (!form.dimensions.trim()) next.dimensions = 'Required'
    if (!form.story.trim()) next.story = 'Add a few lines about the painting.'
    const year = Number(form.year)
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) next.year = 'Enter a four-digit year'
    const price = Number(form.price.replace(/[^0-9.]/g, ''))
    if (!form.price.trim() || !Number.isFinite(price) || price <= 0) next.price = 'Enter a price in US dollars'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const fields = {
      title: form.title.trim(),
      year,
      medium: form.medium.trim(),
      dimensions: form.dimensions.trim(),
      price: Math.round(price),
      status: form.status,
      story: form.story.trim(),
    }
    setPublishing(true)
    try {
      if (editing) await updateArtwork(editing.id, fields, image?.file)
      else if (image) await createArtwork(fields, image.file)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields)
      else setPublishError(err instanceof Error ? err.message : 'The painting could not be saved. Try again.')
      return
    } finally {
      setPublishing(false)
    }
    // Saved: the site now shows the stored copy, so the local preview can go.
    discardImage()
    close()
    if (editing) {
      notify(`Changes to ${fields.title} are saved`)
    } else {
      notify(`${fields.title} is now in the gallery`)
      setForm(blank())
      window.setTimeout(() => scrollToSection('gallery'), 450)
    }
  }

  return (
    <AnimatePresence>
      {studioOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Artist Studio"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.8, ease }}
          className="fixed inset-0 z-50 flex flex-col bg-paper"
        >
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 md:h-[72px] md:px-10">
            <div className="flex min-w-0 items-center gap-6 md:gap-10">
              {/* On phones the tabs need the room; the title returns from the small breakpoint up. */}
              <p className={`shrink-0 font-serif text-2xl ${signedIn ? 'hidden sm:block' : ''}`}>Artist Studio</p>
              {signedIn && (
                <div role="tablist" aria-label="Studio sections" className="flex gap-5 text-[14px]">
                  {(['painting', 'orders'] as const).map((v) => (
                    <button
                      key={v}
                      role="tab"
                      type="button"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`truncate border-b pb-0.5 transition-colors ${view === v ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
                    >
                      {v === 'orders' ? 'Orders' : editing ? `Editing ${editing.title}` : 'Add a painting'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {signedIn && (
                <button type="button" onClick={signOut} className="px-2 text-[13px] whitespace-nowrap text-ink-3 hover:text-ink">
                  Sign out
                </button>
              )}
              <button type="button" onClick={close} aria-label="Close studio" className="grid size-10 place-items-center hover:opacity-60">
                <X size={22} weight="light" />
              </button>
            </div>
          </header>

          {!signedIn ? (
            <StudioSignIn />
          ) : view === 'orders' ? (
            <StudioOrders />
          ) : (
            <form onSubmit={publish} noValidate className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
              {/* Drop zone */}
              <div className="flex flex-col p-4 md:p-10 lg:min-h-0">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`relative grid h-[52dvh] place-items-center border border-dashed transition-[border-color,background-color] duration-300 lg:h-auto lg:min-h-0 lg:flex-1 ${
                    dragging ? 'border-ink bg-wall' : errors.image ? 'border-danger bg-wall' : 'border-line bg-wall'
                  }`}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPT.join(',')}
                    className="sr-only"
                    aria-label="Painting image"
                    onChange={(e) => {
                      takeFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <AnimatePresence mode="wait">
                    {loadingImage ? (
                      <motion.div key="loading" exit={{ opacity: 0 }} className="h-3/4 w-1/2 animate-pulse bg-line" />
                    ) : image ? (
                      <motion.div
                        key={image.url}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease }}
                        className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 md:p-10"
                      >
                        <div className="relative min-h-0 w-full flex-1">
                          <img src={image.url} alt="Preview of the uploaded painting" className="absolute inset-0 h-full w-full object-contain" />
                        </div>
                        <div className="flex items-center gap-6 text-[13px]">
                          <span className="max-w-[24ch] truncate text-ink-3">{image.name}</span>
                          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 underline underline-offset-4">
                            <ImageSquare size={16} weight="light" /> Replace
                          </button>
                          <button type="button" onClick={discardImage} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
                            {editing ? (
                              <>
                                <ArrowCounterClockwise size={16} weight="light" /> Keep current image
                              </>
                            ) : (
                              <>
                                <Trash size={16} weight="light" /> Remove
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    ) : editing ? (
                      <motion.div
                        key={`current-${editing.image}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease }}
                        className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 md:p-10"
                      >
                        <div className="relative min-h-0 w-full flex-1">
                          <ArtImage artwork={editing} className="absolute inset-0 h-full w-full object-contain" />
                        </div>
                        <div className="flex items-center gap-6 text-[13px]">
                          <span className="text-ink-3">Current image</span>
                          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 underline underline-offset-4">
                            <ImageSquare size={16} weight="light" /> Replace
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="empty"
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, scale: dragging ? 1.04 : 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center px-6 text-center"
                      >
                        <UploadSimple size={36} weight="thin" />
                        <span className="mt-5 font-serif text-3xl font-light md:text-4xl">
                          {dragging ? 'Release to upload' : 'Drop a painting here'}
                        </span>
                        <span className="mt-3 text-[14px] text-ink-2">
                          or <span className="underline underline-offset-4">browse files</span>
                        </span>
                        <span className="mt-6 text-[12px] text-ink-3">JPEG, PNG, WebP or AVIF, up to 25 MB</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                {errors.image && (
                  <p role="alert" className="mt-3 text-[13px] text-danger">
                    {errors.image}
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-col border-line lg:overflow-y-auto lg:border-l">
                <div className="flex-1 space-y-5 px-4 py-8 md:px-10">
                  <Field label="Painting title" error={errors.title}>
                    {(p) => <input {...p} value={form.title} onChange={set('title')} className={inputClass(p)} />}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Year" error={errors.year}>
                      {(p) => <input {...p} inputMode="numeric" value={form.year} onChange={set('year')} className={inputClass(p)} />}
                    </Field>
                    <Field label="Price (USD)" error={errors.price}>
                      {(p) => <input {...p} inputMode="decimal" placeholder="8500" value={form.price} onChange={set('price')} className={inputClass(p)} />}
                    </Field>
                  </div>
                  <Field label="Medium" error={errors.medium}>
                    {(p) => <input {...p} placeholder="Oil on linen" value={form.medium} onChange={set('medium')} className={inputClass(p)} />}
                  </Field>
                  <Field label="Canvas size" error={errors.dimensions} hint="Height x width, e.g. 100 x 80 cm">
                    {(p) => <input {...p} value={form.dimensions} onChange={set('dimensions')} className={inputClass(p)} />}
                  </Field>
                  <Field label="Availability">
                    {(p) => (
                      <select {...p} value={form.status} onChange={set('status')} className={inputClass(p, 'h-12 appearance-none bg-paper')}>
                        {(Object.keys(STATUS_LABEL) as ArtworkStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Description" error={errors.story} hint="The story or inspiration behind the work.">
                    {(p) => <textarea {...p} rows={5} value={form.story} onChange={set('story')} className={inputClass(p, 'resize-none py-3 leading-relaxed')} />}
                  </Field>
                </div>
                <div className="sticky bottom-0 border-t border-line bg-paper px-4 py-5 md:px-10">
                  {publishError && (
                    <p role="alert" className="mb-4 text-[13px] text-danger">
                      {publishError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={publishing}
                    className="inline-flex h-12 w-full items-center justify-center bg-ink px-6 text-[13px] font-medium tracking-wide text-paper transition-[background-color,transform] duration-300 hover:bg-ink-2 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                  >
                    {editing ? (publishing ? 'Saving...' : 'Save changes') : publishing ? 'Publishing...' : 'Publish to gallery'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
