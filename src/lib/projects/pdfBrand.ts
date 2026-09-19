import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { jsPDF } from 'jspdf'

/** Keep in sync with BrandMark — avoid importing Next Image into PDF path. */
const BRAND_NAME = 'deco-production'
const BRAND_TAGLINE = 'Production Limited'

let logoCache: string | null | undefined

/** PNG data-URL for jsPDF embed (server-side). */
export function loadBrandLogoDataUrl(): string | null {
  if (logoCache !== undefined) return logoCache
  const candidates = [
    join(process.cwd(), 'public', 'brand', 'deco-logo-256.png'),
    join(process.cwd(), '..', 'public', 'brand', 'deco-logo-256.png'),
  ]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      logoCache = `data:image/png;base64,${readFileSync(p).toString('base64')}`
      return logoCache
    } catch {
      /* try next */
    }
  }
  logoCache = null
  return null
}

export type BrandHeaderResult = {
  /** Y position to continue content below the brand bar */
  contentTop: number
}

/**
 * Draws site logo + company name as a page header bar.
 * Returns the Y where body content should start.
 */
export function drawBrandHeader(
  doc: jsPDF,
  opts: {
    pageW: number
    margin: number
    fontReg: string
    fontBold: string
    reportTitle: string
    projectTitle?: string
  }
): BrandHeaderResult {
  const { pageW, margin, fontReg, fontBold, reportTitle, projectTitle } = opts
  const barH = 58

  // Soft gradient-like bands (two fills — jsPDF has no real gradient)
  doc.setFillColor(241, 245, 249)
  doc.rect(0, 0, pageW, barH, 'F')
  doc.setFillColor(238, 244, 255)
  doc.rect(0, 0, pageW * 0.42, barH, 'F')

  // Accent stripe
  doc.setFillColor(0, 122, 255)
  doc.rect(0, barH - 3, pageW, 3, 'F')

  const logo = loadBrandLogoDataUrl()
  let textX = margin
  if (logo) {
    try {
      const size = 34
      doc.addImage(logo, 'PNG', margin, (barH - size) / 2 - 1, size, size)
      textX = margin + size + 10
    } catch {
      textX = margin
    }
  }

  doc.setFont(fontBold, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text(BRAND_NAME, textX, 22)
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(BRAND_TAGLINE, textX, 34)

  doc.setFont(fontBold, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 122, 255)
  doc.text(reportTitle, pageW - margin, 22, { align: 'right' })
  if (projectTitle) {
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    const clipped =
      projectTitle.length > 42 ? `${projectTitle.slice(0, 40)}…` : projectTitle
    doc.text(clipped, pageW - margin, 36, { align: 'right' })
  }

  doc.setTextColor(30, 30, 30)
  return { contentTop: barH + 12 }
}
