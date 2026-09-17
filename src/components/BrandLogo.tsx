import BrandMark from './BrandMark'

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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0B1736] text-white shadow-sm">
        <BrandMark className="h-8 w-8" strokeWidth={16} />
      </div>
      {showText && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-[#0B1736]">
            SK11
          </div>
          {!compact && (
            <div className="truncate text-xs font-medium text-gray-500">
              Finance
            </div>
          )}
        </div>
      )}
    </div>
  )
}
