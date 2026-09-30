import type { Artwork, ArtworkFields, Customer, Order } from '../types'

/** A failed API call. `fields` holds per-field messages on validation errors (422). */
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>
  readonly unavailable: string[]

  constructor(status: number, body: { error?: string; fields?: Record<string, string>; unavailable?: string[] }) {
    super(body.error ?? `Request failed (${status})`)
    this.status = status
    this.fields = body.fields ?? {}
    this.unavailable = body.unavailable ?? []
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, { error: "Couldn't reach the server. Check your connection and try again." })
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function formData(fields: Partial<ArtworkFields>, image: File) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
  form.append('image', image)
  return form
}

export const api = {
  listArtworks: () => request<Artwork[]>('/artworks'),

  createArtwork: (fields: ArtworkFields, image: File) =>
    request<Artwork>('/artworks', { method: 'POST', body: formData(fields, image) }),

  /** Sends only JSON unless a replacement image is given. */
  updateArtwork: (id: string, fields: Partial<ArtworkFields>, image?: File) =>
    request<Artwork>(
      `/artworks/${encodeURIComponent(id)}`,
      image ? { method: 'PATCH', body: formData(fields, image) } : json('PATCH', fields),
    ),

  deleteArtwork: (id: string) => request<void>(`/artworks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  placeOrder: (artworkIds: string[], customer: Customer) => request<Order>('/orders', json('POST', { artworkIds, customer })),
}
