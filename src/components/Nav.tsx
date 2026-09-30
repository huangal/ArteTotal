import { useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { List, Moon, PaintBrush, Sun, Tote, X } from '@phosphor-icons/react'
import { useStore } from '../state/store'
import { scrollToSection } from '../lib/format'

const LINKS = [
  { id: 'gallery', label: 'Gallery' },
  { id: 'shop', label: 'Shop' },
  { id: 'about', label: 'About' },
]

export function Nav() {
  const { cart, setCartOpen, openStudio, theme, toggleTheme } = useStore()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { scrollY } = useScroll()

  // Only re-renders when crossing the threshold, not on every scroll frame.
  useMotionValueEvent(scrollY, 'change', (y) => {
    const next = y > 24
    if (next !== scrolled) setScrolled(next)
  })

  const go = (id: string) => {
    setMenuOpen(false)
    scrollToSection(id)
  }

  const iconBtn = 'grid size-10 place-items-center text-ink transition-opacity duration-300 hover:opacity-60'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-500 ease-gallery ${
        scrolled ? 'border-b border-line bg-scrim backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:h-[72px] md:px-10">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0 })
          }}
          className="font-serif text-[26px] leading-none font-medium tracking-tight"
        >
          ArteTotal
        </a>

        <div className="hidden items-center gap-10 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="group relative text-[14px] text-ink-2 transition-colors hover:text-ink"
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-ink transition-transform duration-500 ease-gallery group-hover:scale-x-100" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => openStudio()} className={`${iconBtn} hidden md:grid`} aria-label="Open the Artist Studio">
            <PaintBrush size={20} weight="light" />
          </button>
          <button type="button" onClick={toggleTheme} className={iconBtn} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={20} weight="light" /> : <Moon size={20} weight="light" />}
          </button>
          <button type="button" onClick={() => setCartOpen(true)} className={`${iconBtn} relative`} aria-label={`Cart, ${cart.length} ${cart.length === 1 ? 'item' : 'items'}`}>
            <Tote size={21} weight="light" />
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.span
                  key={cart.length}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  className="absolute top-1 right-0.5 grid size-4 place-items-center rounded-full bg-ink text-[10px] font-medium text-paper"
                >
                  {cart.length}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button type="button" onClick={() => setMenuOpen((o) => !o)} className={`${iconBtn} md:hidden`} aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={20} weight="light" /> : <List size={20} weight="light" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-line bg-paper px-4 pt-4 pb-8 md:hidden"
          >
            {[...LINKS, { id: 'studio', label: 'Studio' }].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => (l.id === 'studio' ? (setMenuOpen(false), openStudio()) : go(l.id))}
                className="block w-full py-3 text-left font-serif text-3xl"
              >
                {l.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
