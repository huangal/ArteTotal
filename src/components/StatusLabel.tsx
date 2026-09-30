import { STATUS_LABEL, type ArtworkStatus } from '../types'

/** Availability marker. The dot carries real state, so it only appears for available works. */
export function StatusLabel({ status, className = '' }: { status: ArtworkStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] ${className}`}>
      {status === 'available' && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      <span className={status === 'available' ? 'text-ink' : 'text-ink-3'}>{STATUS_LABEL[status]}</span>
    </span>
  )
}
