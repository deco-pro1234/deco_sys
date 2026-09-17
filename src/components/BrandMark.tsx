import type { CSSProperties } from 'react'

type BrandMarkProps = {
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}

export default function BrandMark({
  className,
  style,
  strokeWidth = 14,
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M29 161C4 142 -1 106 18 77C43 40 95 27 149 33C197 38 234 58 241 90C248 123 229 155 192 170C156 185 109 181 78 163C59 152 45 139 37 126"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M121 20C114 74 110 136 114 236"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M86 149C112 171 149 193 194 199C216 202 237 198 250 188"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
