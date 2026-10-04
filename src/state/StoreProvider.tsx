import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { Artwork, ArtworkFields, Customer } from '../types'
import { StoreContext, type CollectionStatus, type Store, type StudioSession, type Theme } from './store'

interface CollectionState {
  artworks: Artwork[]
  cartIds: string[]
}

type Action =
  | { type: 'load'; artworks: Artwork[] }
  | { type: 'add-artwork'; artwork: Artwork }
  | { type: 'update-artwork'; artwork: Artwork }
  | { type: 'remove-artwork'; id: string }
  | { type: 'add-to-cart'; id: string }
  | { type: 'remove-from-cart'; id: string }
  | { type: 'mark-sold'; ids: string[] }

function reducer(state: CollectionState, action: Action): CollectionState {
  switch (action.type) {
    case 'load': {
      // Keep only cart items that can still be bought.
      const buyable = new Set(action.artworks.filter((a) => a.status === 'available').map((a) => a.id))
      return { artworks: action.artworks, cartIds: state.cartIds.filter((id) => buyable.has(id)) }
    }
    case 'add-artwork':
      return { ...state, artworks: [action.artwork, ...state.artworks] }
    case 'update-artwork': {
      const { artwork } = action
      return {
        artworks: state.artworks.map((a) => (a.id === artwork.id ? artwork : a)),
        // A work that is no longer for sale leaves the cart.
        cartIds: artwork.status === 'available' ? state.cartIds : state.cartIds.filter((id) => id !== artwork.id),
      }
    }
    case 'remove-artwork':
      return {
        artworks: state.artworks.filter((a) => a.id !== action.id),
        cartIds: state.cartIds.filter((id) => id !== action.id),
      }
    case 'add-to-cart': {
      const work = state.artworks.find((a) => a.id === action.id)
      if (!work || work.status !== 'available' || state.cartIds.includes(action.id)) return state
      return { ...state, cartIds: [...state.cartIds, action.id] }
    }
    case 'remove-from-cart':
      return { ...state, cartIds: state.cartIds.filter((id) => id !== action.id) }
    case 'mark-sold':
      return {
        artworks: state.artworks.map((a) => (action.ids.includes(a.id) ? { ...a, status: 'sold' } : a)),
        cartIds: state.cartIds.filter((id) => !action.ids.includes(id)),
      }
  }
}

const THEME_KEY = 'artetotal-theme'

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { artworks: [], cartIds: [] })
  const [collection, setCollection] = useState<CollectionStatus>('loading')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioEditId, setStudioEditId] = useState<string | null>(null)
  const [studioSession, setStudioSession] = useState<StudioSession>('checking')
  const [toast, setToast] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const toastTimer = useRef<number | undefined>(undefined)

  // Follow OS changes until the visitor picks a theme explicitly.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Lock page scroll while any overlay is open.
  const overlayOpen = activeId !== null || cartOpen || studioOpen
  useEffect(() => {
    if (!overlayOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [overlayOpen])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // Storage unavailable (private mode); the choice lasts for this visit.
      }
      return next
    })
  }, [])

  const loadCollection = useCallback(async () => {
    const artworks = await api.listArtworks()
    dispatch({ type: 'load', artworks })
  }, [])

  const fetchCollection = useCallback(() => {
    loadCollection().then(
      () => setCollection('ready'),
      () => setCollection('error'),
    )
  }, [loadCollection])

  // `collection` starts as 'loading', so the first fetch needs no state change up front.
  useEffect(fetchCollection, [fetchCollection])

  const reloadCollection = useCallback(() => {
    setCollection('loading')
    fetchCollection()
  }, [fetchCollection])

  // Whether this browser is signed in to the Studio (it decides who sees editing controls).
  useEffect(() => {
    api.session().then(
      (s) => setStudioSession(!s.configured ? 'locked' : s.signedIn ? 'signed-in' : 'signed-out'),
      () => setStudioSession('signed-out'),
    )
  }, [])

  const sessionExpired = useCallback(() => setStudioSession((s) => (s === 'locked' ? s : 'signed-out')), [])

  /** Runs a Studio request; a 401 means the session ended, so ask to sign in again. */
  const studio = useCallback(
    async <T,>(run: () => Promise<T>) => {
      try {
        return await run()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) sessionExpired()
        throw err
      }
    },
    [sessionExpired],
  )

  const signIn = useCallback(async (password: string) => {
    await api.signIn(password)
    setStudioSession('signed-in')
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut().catch(() => {})
    setStudioSession('signed-out')
  }, [])

  const createArtwork = useCallback(
    async (fields: ArtworkFields, image: File) => {
      const artwork = await studio(() => api.createArtwork(fields, image))
      dispatch({ type: 'add-artwork', artwork })
      return artwork
    },
    [studio],
  )

  const updateArtwork = useCallback(
    async (id: string, fields: Partial<ArtworkFields>, image?: File) => {
      const artwork = await studio(() => api.updateArtwork(id, fields, image))
      dispatch({ type: 'update-artwork', artwork })
      return artwork
    },
    [studio],
  )

  const openStudio = useCallback((editId?: string) => {
    setStudioEditId(editId ?? null)
    setStudioOpen(true)
  }, [])

  const removeArtwork = useCallback(
    async (id: string) => {
      try {
        await studio(() => api.deleteArtwork(id))
      } catch (err) {
        // Already gone on the server: still take it off this page.
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
      dispatch({ type: 'remove-artwork', id })
      setActiveId((current) => (current === id ? null : current))
    },
    [studio],
  )

  const completePurchase = useCallback(
    async (customer: Customer) => {
      try {
        const order = await api.placeOrder(state.cartIds, customer)
        dispatch({ type: 'mark-sold', ids: order.items.map((a) => a.id) })
        return order
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) await loadCollection().catch(() => {})
        throw err
      }
    },
    [state.cartIds, loadCollection],
  )

  const value = useMemo<Store>(() => {
    const cart = state.cartIds
      .map((id) => state.artworks.find((a) => a.id === id))
      .filter((a): a is Artwork => Boolean(a))
    return {
      artworks: state.artworks,
      collection,
      reloadCollection,
      cart,
      createArtwork,
      updateArtwork,
      removeArtwork,
      addToCart: (id) => dispatch({ type: 'add-to-cart', id }),
      removeFromCart: (id) => dispatch({ type: 'remove-from-cart', id }),
      inCart: (id) => state.cartIds.includes(id),
      completePurchase,
      activeId,
      openArtwork: setActiveId,
      closeArtwork: () => setActiveId(null),
      cartOpen,
      setCartOpen,
      studioOpen,
      studioEditId,
      openStudio,
      closeStudio: () => setStudioOpen(false),
      studioSession,
      signIn,
      signOut,
      sessionExpired,
      toast,
      notify,
      theme,
      toggleTheme,
    }
  }, [state, collection, reloadCollection, createArtwork, updateArtwork, removeArtwork, completePurchase, activeId, cartOpen, studioOpen, studioEditId, openStudio, studioSession, signIn, signOut, sessionExpired, toast, notify, theme, toggleTheme])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
