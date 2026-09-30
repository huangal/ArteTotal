import { useState, type ComponentPropsWithRef } from 'react'
import type { Artwork } from '../types'

type Props = Omit<ComponentPropsWithRef<'img'>, 'src' | 'alt'> & {
  artwork: Artwork
}

/** Painting image that swaps to its placeholder if the real file is missing. */
export function ArtImage({ artwork, onError, ...rest }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = failed === artwork.image && artwork.fallback ? artwork.fallback : artwork.image

  return (
    <img
      {...rest}
      src={src}
      alt={`${artwork.title}, ${artwork.medium.toLowerCase()}, ${artwork.year}`}
      draggable={false}
      onError={(e) => {
        if (src === artwork.image) setFailed(artwork.image)
        onError?.(e)
      }}
    />
  )
}
