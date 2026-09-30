const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const formatPrice = (value: number) => usd.format(value)

export const scrollToSection = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ block: 'start' })

export const ENQUIRY_EMAIL = 'studio@artetotal.com'

export const enquiryHref = (title?: string) =>
  `mailto:${ENQUIRY_EMAIL}${title ? `?subject=${encodeURIComponent(`Enquiry: ${title}`)}` : ''}`
