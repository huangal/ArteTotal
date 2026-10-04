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

export type OrderStatus = 'new' | 'paid' | 'shipped' | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  paid: 'Paid',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}

/** The statuses an order can move to from each status. Cancelling puts its paintings back on sale. */
export const ORDER_STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
}

/** An order as the Studio sees it, with the customer's details. */
export interface OrderSummary {
  number: string
  status: OrderStatus
  total: number
  /** ISO date-times. */
  createdAt: string
  updatedAt: string
  customer: Customer
  items: { artworkId: string; title: string; price: number }[]
}
