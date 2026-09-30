export type ArtworkStatus = 'available' | 'reserved' | 'sold'

export interface Artwork {
  id: string
  title: string
  year: number
  medium: string
  dimensions: string
  /** Price in whole US dollars. */
  price: number
  status: ArtworkStatus
  /** Primary image. Seed works point at /art/*.jpg; uploads use an object URL. */
  image: string
  /** Shown when `image` fails to load (e.g. the file isn't in public/art yet). */
  fallback?: string
  story: string
}

export const STATUS_LABEL: Record<ArtworkStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  sold: 'In Private Collection',
}

/** The editable fields of a painting, as sent to the API. */
export type ArtworkFields = Omit<Artwork, 'id' | 'image' | 'fallback'>

export interface Customer {
  name: string
  email: string
  address: string
  city: string
  postcode: string
  country: string
}

export interface Order {
  number: string
  items: Artwork[]
  total: number
}
