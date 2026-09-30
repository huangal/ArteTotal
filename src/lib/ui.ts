export interface FieldProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
}

export const inputClass = (p: FieldProps, extra = '') =>
  `w-full border bg-transparent px-4 text-[15px] text-ink placeholder:text-ink-3 transition-colors duration-300 outline-none focus:border-ink ${
    p['aria-invalid'] ? 'border-danger' : 'border-line hover:border-ink-3'
  } ${extra || 'h-12'}`
