import Image from 'next/image'
import type { CSSProperties } from 'react'

export const BRAND_LOGO_SRC = '/brand/deco-logo-256.png'
export const BRAND_NAME = 'deco-production'
export const BRAND_NAME_SHORT = 'deco'
export const BRAND_TAGLINE = 'Production Limited'

type BrandMarkProps = {
  className?: string
  style?: CSSProperties
  /** Kept for call-site compatibility; ignored for the raster logo. */
  strokeWidth?: number
  size?: number
  alt?: string
  priority?: boolean
}

export default function BrandMark({
  className,
  style,
  size,
  alt = 'deco Production Limited',
  priority = false,
}: BrandMarkProps) {
  const resolvedSize = size ?? 44

  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={alt}
      width={resolvedSize}
      height={resolvedSize}
      priority={priority}
      className={`rounded-full object-cover ${className ?? ''}`}
      style={style}
    />
  )
}
