import { InstagramLogo } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { ENQUIRY_EMAIL, enquiryHref } from '../lib/format'

export function Footer() {
  const { openStudio } = useStore()
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-4 pt-20 pb-10 md:grid-cols-12 md:px-10 md:pt-28">
        <div className="md:col-span-7">
          <p className="font-serif text-[64px] leading-none font-light tracking-[-0.03em] md:text-[120px]">ArteTotal</p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-[14px] md:col-span-5 md:pt-6">
          <div className="space-y-3">
            <a href={enquiryHref()} className="block text-ink hover:opacity-60">
              Enquire
            </a>
            <p className="text-ink-3">{ENQUIRY_EMAIL}</p>
          </div>
          <div className="space-y-3">
            <a href="https://instagram.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:opacity-60">
              <InstagramLogo size={18} weight="light" />
              Instagram
            </a>
            <button type="button" onClick={() => openStudio()} className="block text-ink-3 hover:text-ink">
              Artist Studio
            </button>
          </div>
        </div>
        <p className="text-[12px] text-ink-3 md:col-span-12 md:mt-16">
          &copy; {new Date().getFullYear()} Carlos Huangal. All images of artworks are the property of the artist.
        </p>
      </div>
    </footer>
  )
}
