import BrandMark, {
  BRAND_NAME,
  BRAND_NAME_SHORT,
  BRAND_TAGLINE,
} from './BrandMark'

type BrandLogoProps = {
  className?: string
  showText?: boolean
  compact?: boolean
}

export default function BrandLogo({
  className,
  showText = true,
  compact = false,
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <BrandMark className="h-11 w-11 shrink-0 shadow-sm" size={44} priority />
      {showText && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold lowercase tracking-[0.08em] text-[#1A1040]">
            {compact ? BRAND_NAME : BRAND_NAME_SHORT}
          </div>
          {!compact && (
            <div className="truncate text-xs font-medium text-gray-500">
              {BRAND_TAGLINE}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
