import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'

export function Toast() {
  const { toast } = useStore()
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 md:left-10 md:translate-x-0">
      <AnimatePresence>
        {toast && (
          <motion.p
            key={toast}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="bg-ink px-5 py-3 text-[13px] whitespace-nowrap text-paper"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
