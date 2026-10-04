import { createContext, useContext } from 'react'
import type { Artwork, ArtworkFields, Customer, Order } from '../types'

export type Theme = 'light' | 'dark'
export type CollectionStatus = 'loading' | 'ready' | 'error'
/** The Studio login: 'locked' means the site has no Studio password set, so nobody can sign in. */
export type StudioSession = 'checking' | 'signed-out' | 'signed-in' | 'locked'

export interface Store {
  artworks: Artwork[]
  /** Whether the collection has loaded from the API. */
  collection: CollectionStatus
  reloadCollection: () => void
  cart: Artwork[]
  /** Saves a new painting through the API and adds it to the top of the collection. Throws ApiError. */
  createArtwork: (fields: ArtworkFields, image: File) => Promise<Artwork>
  /** Saves changes to a work (and optionally a new image) through the API. Throws ApiError. */
  updateArtwork: (id: string, fields: Partial<ArtworkFields>, image?: File) => Promise<Artwork>
  /** Deletes a work through the API, then takes it out of the collection (and the cart), closing it if open. Throws ApiError. */
  removeArtwork: (id: string) => Promise<void>
  addToCart: (id: string) => void
  removeFromCart: (id: string) => void
  inCart: (id: string) => boolean
  /**
   * Places an order for everything in the cart, which marks those works sold, and empties the cart.
   * Throws ApiError; on a 409 the collection is refreshed so the cart drops works that were sold meanwhile.
   */
  completePurchase: (customer: Customer) => Promise<Order>

  activeId: string | null
  openArtwork: (id: string) => void
  closeArtwork: () => void

  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  studioOpen: boolean
  /** The work the Studio is editing, or null when it is adding a new one. */
  studioEditId: string | null
  /** Opens the Studio to add a painting, or to edit the one with `editId`. */
  openStudio: (editId?: string) => void
  closeStudio: () => void

  studioSession: StudioSession
  /** Signs in to the Studio. Throws ApiError (401 wrong password, 429 too many attempts). */
  signIn: (password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Call when a Studio request comes back 401, so the Studio asks to sign in again. */
  sessionExpired: () => void

  toast: string | null
  notify: (message: string) => void

  theme: Theme
  toggleTheme: () => void
}

export const StoreContext = createContext<Store | null>(null)

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}
