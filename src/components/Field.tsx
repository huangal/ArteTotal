import { useId, type ReactNode } from 'react'
import type { FieldProps } from '../lib/ui'

/** Label above, control, then hint or error below. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: (props: FieldProps) => ReactNode
}) {
  const id = useId()
  const noteId = `${id}-note`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] text-ink-2">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error || hint ? noteId : undefined })}
      {error ? (
        <p id={noteId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-[12px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
