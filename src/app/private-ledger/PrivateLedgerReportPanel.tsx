'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { getPrivateReportRecords } from '../actions/private-record'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'

type PeriodMode = 'year' | 'month' | 'custom'

type ColumnId =
  | 'date'
  | 'type'
  | 'category'
  | 'amount'
  | 'content'
  | 'note'
  | 'voucherNo'
  | 'attachmentCount'
  | 'createdAt'

type PrivateReportRecord = {
  id: string
  date: string | Date
  type: string
  amount: number
  content?: string | null
  note?: string | null
  customCategory?: string | null
  attachmentUrl?: string | null
  createdAt?: string | Date
  category?: { name: string } | null
  subCategory?: { name: string } | null
  thirdCategory?: { name: string } | null
  attachments?: Array<{ id: string; fileUrl: string; note?: string | null }>
}

type Props = {
  locale: Locale
  ownerId: string
  ownerName: string
}

type ExportCol = {
  id: string
  head: string
  width?: number | 'auto'
  halign?: 'left' | 'center' | 'right'
  cell: string
}

const COLUMN_OPTIONS: Array<{ id: ColumnId; labelKey: string; defaultOn: boolean }> = [
  { id: 'date', labelKey: 'date', defaultOn: true },
  { id: 'type', labelKey: 'type', defaultOn: true },
  { id: 'category', labelKey: 'category', defaultOn: true },
  { id: 'amount', labelKey: 'amount', defaultOn: true },
  { id: 'content', labelKey: 'recordContent', defaultOn: true },
  { id: 'note', labelKey: 'note', defaultOn: true },
  { id: 'voucherNo', labelKey: 'voucherNo', defaultOn: true },
  { id: 'attachmentCount', labelKey: 'attachmentCount', defaultOn: false },
  { id: 'createdAt', labelKey: 'createdAt', defaultOn: false },
]

function defaultVisibleMap(): Record<ColumnId, boolean> {
  const map = {} as Record<ColumnId, boolean>
  for (const col of COLUMN_OPTIONS) map[col.id] = col.defaultOn
  return map
}

function categoryLabel(item: PrivateReportRecord, fallback: string) {
  return (
    item.customCategory?.trim() ||
    [item.category?.name, item.subCategory?.name, item.thirdCategory?.name].filter(Boolean).join(' / ') ||
    fallback
  )
}

function attachmentCountOf(item: PrivateReportRecord) {
  const listed = Array.isArray(item.attachments) ? item.attachments.length : 0
  if (listed > 0) return listed
  return item.attachmentUrl ? 1 : 0
}

function collectAttachmentUrls(record: PrivateReportRecord): string[] {
  const urls: string[] = []
  if (Array.isArray(record.attachments)) {
    for (const attachment of record.attachments) {
      if (attachment?.fileUrl && !urls.includes(attachment.fileUrl)) urls.push(attachment.fileUrl)
    }
  }
  if (record.attachmentUrl && !urls.includes(record.attachmentUrl)) {
    urls.push(record.attachmentUrl)
  }
  return urls
}

function safeFilePart(value: string, max = 36) {
  return (
    String(value || '-')
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, max) || 'na'
  )
}

function padVoucherNo(index: number) {
  return `V${String(index).padStart(3, '0')}`
}

function dataUrlToUint8(dataUrl: string): Uint8Array | null {
  try {
    const commaIdx = dataUrl.indexOf(',')
    if (commaIdx < 0) return null
    const header = dataUrl.slice(0, commaIdx)
    const data = dataUrl.slice(commaIdx + 1)
    const isBase64 = /;base64/i.test(header)
    if (isBase64) {
      const rawBin = atob(data)
      const u8 = new Uint8Array(rawBin.length)
      for (let b = 0; b < rawBin.length; b++) u8[b] = rawBin.charCodeAt(b)
      return u8
    }
    return new TextEncoder().encode(decodeURIComponent(data))
  } catch {
    return null
  }
}

function extFromDataUrl(dataUrl: string) {
  const mimeMatch = String(dataUrl).match(/^data:([^;,]+)(?:;[^;,]*)*;base64,/i)
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'application/octet-stream'
  let ext = mimeType.split('/').pop() || 'bin'
  if (ext === 'jpeg') ext = 'jpg'
  if (ext === 'x-icon') ext = 'ico'
  if (mimeType.includes('pdf')) ext = 'pdf'
  return ext
}

function csvEscape(value: string) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildColumnStyles(cols: ExportCol[]) {
  const styles: Record<number, { cellWidth?: number | 'auto'; halign?: 'left' | 'center' | 'right' }> = {}
  cols.forEach((col, index) => {
    const style: { cellWidth?: number | 'auto'; halign?: 'left' | 'center' | 'right' } = {}
    if (col.width !== undefined) style.cellWidth = col.width
    if (col.halign) style.halign = col.halign
    if (Object.keys(style).length > 0) styles[index] = style
  })
  return styles
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export default function PrivateLedgerReportPanel({ locale, ownerId, ownerName }: Props) {
  const t = createTranslator(locale)
  const dateLocale = locale === 'en' ? 'en-HK' : 'zh-HK'
  const now = useMemo(() => new Date(), [])
  const yearOptions = useMemo(() => {
    const current = now.getFullYear()
    return Array.from({ length: 12 }, (_, i) => current - i)
  }, [now])

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')
  const [categoryKeyword, setCategoryKeyword] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>(defaultVisibleMap)
  const [records, setRecords] = useState<PrivateReportRecord[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fontBase64, setFontBase64] = useState<string | null>(null)
  const [periodLabel, setPeriodLabel] = useState('')

  useEffect(() => {
    const loadFont = async () => {
      try {
        const res = await fetch('/fonts/NotoSansSC-Regular.ttf')
        if (!res.ok) throw new Error('font not found')
        const buffer = await res.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        setFontBase64(window.btoa(binary))
      } catch {
        setFontBase64(null)
      }
    }
    loadFont()
  }, [])

  const visibleColumnCount = COLUMN_OPTIONS.filter((col) => visibleColumns[col.id]).length

  const buildDateRange = () => {
    if (periodMode === 'year') {
      return {
        startDate: new Date(year, 0, 1, 0, 0, 0, 0),
        endDate: new Date(year, 11, 31, 23, 59, 59, 999),
        label: String(year),
      }
    }
    if (periodMode === 'month') {
      return {
        startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
        endDate: new Date(year, month, 0, 23, 59, 59, 999),
        label: `${year}-${pad2(month)}`,
      }
    }
    const range: { startDate?: Date; endDate?: Date; label: string } = { label: t('allTime') }
    if (startDate) range.startDate = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      range.endDate = end
    }
    if (startDate && endDate) range.label = `${startDate} – ${endDate}`
    else if (startDate) range.label = `${startDate} –`
    else if (endDate) range.label = `– ${endDate}`
    return range
  }

  const handleSearch = async () => {
    setLoading(true)
    try {
      const range = buildDateRange()
      const rows = await getPrivateReportRecords({
        ownerId,
        startDate: range.startDate,
        endDate: range.endDate,
        type: typeFilter,
        categoryKeyword,
      })
      setRecords(rows as PrivateReportRecord[])
      setPeriodLabel(range.label)
      setHasSearched(true)
    } finally {
      setLoading(false)
    }
  }

  const createPdfDoc = (orientation: 'portrait' | 'landscape' = 'portrait') => {
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
    if (fontBase64) {
      doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'bold')
      doc.setFont('NotoSansSC')
    }
    return doc
  }

  const pdfFont = () => (fontBase64 ? 'NotoSansSC' : 'helvetica')

  const buildExportCols = (
    item: PrivateReportRecord,
    extras?: { voucherNo?: string }
  ): ExportCol[] => {
    const cols: ExportCol[] = []
    if (visibleColumns.date) {
      cols.push({
        id: 'date',
        head: t('date'),
        cell: new Date(item.date).toLocaleDateString(dateLocale),
        width: 22,
      })
    }
    if (visibleColumns.type) {
      cols.push({
        id: 'type',
        head: t('type'),
        cell: item.type === 'INCOME' ? t('income') : t('expense'),
        width: 14,
      })
    }
    if (visibleColumns.category) {
      cols.push({
        id: 'category',
        head: t('category'),
        cell: categoryLabel(item, t('uncategorized')),
        width: 28,
      })
    }
    if (visibleColumns.amount) {
      cols.push({
        id: 'amount',
        head: t('amount'),
        cell: formatCurrency(locale, item.amount),
        width: 22,
        halign: 'right',
      })
    }
    if (visibleColumns.content) {
      cols.push({ id: 'content', head: t('recordContent'), cell: item.content || '-', width: 28 })
    }
    if (visibleColumns.note) {
      cols.push({ id: 'note', head: t('note'), cell: item.note || '-', width: 'auto' })
    }
    if (visibleColumns.voucherNo) {
      cols.push({
        id: 'voucherNo',
        head: t('voucherNo'),
        cell: extras?.voucherNo || '-',
        width: 16,
      })
    }
    if (visibleColumns.attachmentCount) {
      cols.push({
        id: 'attachmentCount',
        head: t('attachmentCount'),
        cell: String(attachmentCountOf(item)),
        width: 14,
        halign: 'center',
      })
    }
    if (visibleColumns.createdAt) {
      cols.push({
        id: 'createdAt',
        head: t('createdAt'),
        cell: item.createdAt ? new Date(item.createdAt).toLocaleString(dateLocale) : '-',
        width: 28,
      })
    }
    return cols
  }

  const ensureColumns = () => {
    if (visibleColumnCount > 0) return true
    alert(t('reportColumnsRequired'))
    return false
  }

  const summarize = (rows: PrivateReportRecord[]) => {
    let totalIncome = 0
    let totalExpense = 0
    rows.forEach((r) => {
      const val = Math.abs(Number(r.amount) || 0)
      if (r.type === 'INCOME') totalIncome += val
      else totalExpense += val
    })
    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      totalCount: rows.length,
    }
  }

  const exportListPdf = () => {
    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }
    if (!ensureColumns()) return

    const { totalIncome, totalExpense, balance, totalCount } = summarize(records)
    const doc = createPdfDoc('landscape')
    const pageW = doc.internal.pageSize.getWidth()
    const marginX = 10

    doc.setFillColor(236, 242, 255)
    doc.rect(0, 0, pageW, 24, 'F')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(0, 122, 255)
    doc.text(t('privateLedgerReportTitle'), pageW / 2, 11, { align: 'center' })
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    doc.text(
      `${t('privateLedgerOwner')}: ${ownerName}  ·  ${t('statisticsPeriod')}: ${periodLabel || t('allTime')}  ·  ${totalCount} ${t('resultCount')}`,
      pageW / 2,
      18,
      { align: 'center' }
    )

    doc.setFontSize(9)
    doc.setTextColor(40, 40, 50)
    doc.text(
      `${t('totalIncome')}: ${totalIncome.toFixed(2)}   ${t('totalExpense')}: ${totalExpense.toFixed(2)}   ${t('balance')}: ${balance.toFixed(2)}`,
      marginX,
      30
    )

    const prepared = records.map((r, i) => buildExportCols(r, { voucherNo: padVoucherNo(i + 1) }))
    autoTable(doc, {
      startY: 34,
      head: [prepared[0]?.map((c) => c.head) || []],
      body: prepared.map((cols) => cols.map((c) => c.cell)),
      styles: { font: pdfFont(), fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 122, 255], textColor: 255, font: pdfFont(), fontSize: 7, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: buildColumnStyles(prepared[0] || []),
    })

    doc.save(locale === 'en' ? 'private-ledger-report.pdf' : '私帳報表_明細.pdf')
  }

  const exportPackZip = async () => {
    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }
    if (!ensureColumns()) return

    setExporting(true)
    try {
      const zip = new JSZip()
      const voucherFolderName = t('attachmentsFolder')
      const attFolder = zip.folder(voucherFolderName)
      const { totalIncome, totalExpense, balance, totalCount } = summarize(records)
      const genDate = new Date().toLocaleString(dateLocale)
      const stampDate = new Date()
      const stamp = `${stampDate.getFullYear()}${pad2(stampDate.getMonth() + 1)}${pad2(stampDate.getDate())}`
      const typeFilterLabel =
        typeFilter === 'ALL' ? t('all') : typeFilter === 'INCOME' ? t('income') : t('expense')
      const categoryFilterLabel = categoryKeyword.trim() || t('all')

      type PreparedRow = {
        record: PrivateReportRecord
        voucherNo: string
        dateStr: string
        typeLabel: string
        amountAbs: number
        fileNames: string[]
      }

      const prepared: PreparedRow[] = []
      const csvRows: string[] = []
      csvRows.push(
        [
          t('voucherNo'),
          t('date'),
          t('type'),
          t('category'),
          t('amount'),
          t('recordContent'),
          t('note'),
          t('attachmentCount'),
          t('recordId'),
          t('voucherFile'),
        ]
          .map(csvEscape)
          .join(',')
      )

      for (let i = 0; i < totalCount; i++) {
        const r = records[i]
        const voucherNo = padVoucherNo(i + 1)
        const dateObj = new Date(r.date)
        const dateStr = dateObj.toLocaleDateString(dateLocale)
        const isoDay = `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`
        const typeLabel = r.type === 'INCOME' ? t('income') : t('expense')
        const typeCode = r.type === 'INCOME' ? 'IN' : 'EX'
        const amountAbs = Math.abs(Number(r.amount) || 0)
        const catLeaf = categoryLabel(r, 'na')
        const urls = collectAttachmentUrls(r)
        const fileNames: string[] = []

        if (urls.length === 0) {
          csvRows.push(
            [
              voucherNo,
              dateStr,
              typeLabel,
              categoryLabel(r, t('uncategorized')),
              amountAbs.toFixed(2),
              r.content || '-',
              r.note || '-',
              '0',
              r.id,
              t('noVoucher'),
            ]
              .map(csvEscape)
              .join(',')
          )
        } else {
          urls.forEach((dataUrl, k) => {
            const ext = extFromDataUrl(dataUrl)
            const suffix = urls.length > 1 ? `_${k + 1}` : ''
            const fileName =
              [voucherNo + suffix, isoDay, typeCode, safeFilePart(catLeaf, 24), amountAbs.toFixed(2)].join('_') +
              `.${ext}`
            fileNames.push(fileName)
            if (attFolder && dataUrl.startsWith('data:')) {
              const bytes = dataUrlToUint8(dataUrl)
              if (bytes) attFolder.file(fileName, bytes)
            }
            csvRows.push(
              [
                voucherNo,
                dateStr,
                typeLabel,
                categoryLabel(r, t('uncategorized')),
                amountAbs.toFixed(2),
                r.content || '-',
                r.note || '-',
                String(urls.length),
                r.id,
                `${voucherFolderName}/${fileName}`,
              ]
                .map(csvEscape)
                .join(',')
            )
          })
        }

        prepared.push({ record: r, voucherNo, dateStr, typeLabel, amountAbs, fileNames })
      }

      zip.file(t('voucherIndexCsv'), '\uFEFF' + csvRows.join('\n'))

      const doc = createPdfDoc('portrait')
      const pageW = doc.internal.pageSize.getWidth()
      const ink: [number, number, number] = [28, 35, 45]
      const muted: [number, number, number] = [100, 110, 120]
      const line: [number, number, number] = [210, 215, 220]
      const accent: [number, number, number] = [30, 58, 95]
      const mx = 16

      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, pageW, 36, 'F')
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(255, 255, 255)
      doc.text(t('privateLedgerPackTitle'), mx, 16)
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(10)
      doc.text(t('privateLedgerPackSubtitle'), mx, 26)

      doc.setTextColor(ink[0], ink[1], ink[2])
      doc.setFontSize(11)
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.text(t('statisticsPeriod'), mx, 50)
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.text(periodLabel || t('allTime'), mx + 40, 50)
      doc.setTextColor(muted[0], muted[1], muted[2])
      doc.setFontSize(9)
      doc.text(`${t('generated')}: ${genDate}`, mx, 58)
      doc.text(t('currencyUnit'), mx + 110, 58)

      const boxY = 68
      const boxH = 28
      const gap = 4
      const boxW = (pageW - mx * 2 - gap * 3) / 4
      const kpis = [
        { label: t('totalTransactions'), value: String(totalCount), color: ink },
        { label: t('totalIncome'), value: totalIncome.toFixed(2), color: [34, 120, 80] as [number, number, number] },
        { label: t('totalExpense'), value: totalExpense.toFixed(2), color: [170, 50, 45] as [number, number, number] },
        {
          label: t('balance'),
          value: `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}`,
          color: ink,
        },
      ]
      kpis.forEach((kpi, idx) => {
        const x = mx + idx * (boxW + gap)
        doc.setDrawColor(line[0], line[1], line[2])
        doc.setFillColor(248, 249, 251)
        doc.roundedRect(x, boxY, boxW, boxH, 1.5, 1.5, 'FD')
        doc.setFontSize(8)
        doc.setTextColor(muted[0], muted[1], muted[2])
        if (fontBase64) doc.setFont('NotoSansSC', 'normal')
        doc.text(kpi.label, x + 4, boxY + 9)
        if (fontBase64) doc.setFont('NotoSansSC', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2])
        doc.text(kpi.value, x + 4, boxY + 21)
      })

      let y = 110
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(ink[0], ink[1], ink[2])
      doc.text(t('filterSummary'), mx, y)
      y += 7
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(muted[0], muted[1], muted[2])
      ;[
        `${t('privateLedgerOwner')}: ${ownerName}`,
        `${t('type')}: ${typeFilterLabel}`,
        `${t('privateCategoryLabel')}: ${categoryFilterLabel}`,
      ].forEach((lineText) => {
        doc.text(lineText, mx, y)
        y += 6
      })

      y += 4
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(ink[0], ink[1], ink[2])
      doc.text(t('packContents'), mx, y)
      y += 7
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(muted[0], muted[1], muted[2])
      ;[t('packContentPdf'), t('packContentVouchers'), t('packContentCsv')].forEach((lineText) => {
        const wrapped = doc.splitTextToSize(`• ${lineText}`, pageW - mx * 2)
        doc.text(wrapped, mx, y)
        y += wrapped.length * 5 + 2
      })

      const categoryStats: Record<string, number> = {}
      records
        .filter((r) => r.type === 'EXPENSE')
        .forEach((r) => {
          const catName = categoryLabel(r, t('uncategorized'))
          categoryStats[catName] = (categoryStats[catName] || 0) + Math.abs(r.amount)
        })
      const catRows = Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => {
          const pct = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) + '%' : '0%'
          return [name, amount.toFixed(2), pct]
        })

      if (catRows.length > 0) {
        y += 4
        if (fontBase64) doc.setFont('NotoSansSC', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(ink[0], ink[1], ink[2])
        doc.text(t('categoryExpenseStats'), mx, y)
        autoTable(doc, {
          startY: y + 4,
          head: [[t('category'), t('amount'), '%']],
          body: catRows,
          styles: { font: pdfFont(), fontSize: 9, cellPadding: 2, textColor: ink },
          headStyles: { fillColor: accent, textColor: 255, font: pdfFont(), fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 249, 251] },
          margin: { left: mx, right: mx },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 45, halign: 'right' },
            2: { cellWidth: 25, halign: 'right' },
          },
        })
      }

      doc.addPage('a4', 'landscape')
      const landW = doc.internal.pageSize.getWidth()
      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, landW, 18, 'F')
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(255, 255, 255)
      doc.text(t('accountingLedgerTitle'), 12, 12)
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(8)
      doc.text(
        `${t('statisticsPeriod')}: ${periodLabel || t('allTime')}  ·  ${totalCount} ${t('resultCount')}`,
        landW - 12,
        12,
        { align: 'right' }
      )

      const ledgerRowCols = prepared.map((row) =>
        buildExportCols(row.record, { voucherNo: row.voucherNo })
      )
      autoTable(doc, {
        startY: 24,
        head: [ledgerRowCols[0]?.map((c) => c.head) || []],
        body: ledgerRowCols.map((cols) => cols.map((c) => c.cell)),
        styles: {
          font: pdfFont(),
          fontSize: 7,
          cellPadding: 1.3,
          overflow: 'linebreak',
          valign: 'middle',
          textColor: ink,
        },
        headStyles: {
          fillColor: accent,
          textColor: 255,
          font: pdfFont(),
          fontSize: 7,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [248, 249, 251] },
        margin: { left: 10, right: 10 },
        columnStyles: buildColumnStyles(ledgerRowCols[0] || []),
      })

      const pageCount = doc.getNumberOfPages()
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const w = doc.internal.pageSize.getWidth()
        const h = doc.internal.pageSize.getHeight()
        doc.setDrawColor(line[0], line[1], line[2])
        doc.setLineWidth(0.2)
        doc.line(10, h - 10, w - 10, h - 10)
        doc.setFontSize(7)
        doc.setTextColor(muted[0], muted[1], muted[2])
        if (fontBase64) doc.setFont('NotoSansSC', 'normal')
        doc.text(`${t('privateLedgerPackTitle')} · ${ownerName}`, 10, h - 5)
        doc.text(`${p} / ${pageCount}`, w - 10, h - 5, { align: 'right' })
      }

      const pdfName =
        locale === 'en' ? `01_private_ledger_report_${stamp}.pdf` : `01_私帳報表_${stamp}.pdf`
      zip.file(pdfName, doc.output('arraybuffer'))

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = locale === 'en' ? `private-ledger-pack_${stamp}.zip` : `私帳結算包_${stamp}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      alert(t('zipExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20'
  const totals = hasSearched ? summarize(records) : null

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('privateLedgerReport')}</h3>
        <p className="mt-1 text-sm text-gray-500">{t('privateLedgerReportHint')}</p>
        <p className="mt-2 text-xs text-gray-400">{t('privateLedgerReportAttachmentsHint')}</p>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {t('privateLedgerPeriodMode')}
        </label>
        <div className="inline-flex flex-wrap rounded-xl bg-[#F2F2F7] p-1">
          {(
            [
              ['year', 'privateLedgerPeriodYear'],
              ['month', 'privateLedgerPeriodMonth'],
              ['custom', 'privateLedgerPeriodCustom'],
            ] as const
          ).map(([mode, labelKey]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPeriodMode(mode)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                periodMode === mode ? 'bg-white text-[#007AFF] shadow-sm' : 'text-gray-600'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(periodMode === 'year' || periodMode === 'month') && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('privateLedgerSelectYear')}
            </label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        {periodMode === 'month' && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('privateLedgerSelectMonth')}
            </label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}
                </option>
              ))}
            </select>
          </div>
        )}
        {periodMode === 'custom' && (
          <>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t('startDate')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t('endDate')}
              </label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('type')}
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'INCOME' | 'EXPENSE')}
            className={inputClass}
          >
            <option value="ALL">{t('all')}</option>
            <option value="INCOME">{t('income')}</option>
            <option value="EXPENSE">{t('expense')}</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('privateCategoryLabel')}
          </label>
          <input
            value={categoryKeyword}
            onChange={(e) => setCategoryKeyword(e.target.value)}
            placeholder={t('privateLedgerCategoryKeywordPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-gray-100 bg-[#F9FAFB] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('reportOptionalColumns')}
            </label>
            <p className="mt-0.5 text-xs text-gray-500">{t('privateLedgerColumnsHint')}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setVisibleColumns(Object.fromEntries(COLUMN_OPTIONS.map((c) => [c.id, true])) as Record<ColumnId, boolean>)
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
            >
              {t('selectAll')}
            </button>
            <button
              type="button"
              onClick={() =>
                setVisibleColumns(
                  Object.fromEntries(COLUMN_OPTIONS.map((c) => [c.id, false])) as Record<ColumnId, boolean>
                )
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
            >
              {t('reportColumnsClear')}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {COLUMN_OPTIONS.map((col) => (
            <label key={col.id} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(visibleColumns[col.id])}
                onChange={(e) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    [col.id]: e.target.checked,
                  }))
                }
              />
              {t(col.labelKey as 'date')}
            </label>
          ))}
        </div>
        {visibleColumnCount === 0 ? (
          <p className="mt-2 text-xs text-[#FF3B30]">{t('reportColumnsRequired')}</p>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="rounded-xl bg-[#007AFF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0066CC] disabled:opacity-50"
        >
          {loading ? t('queryLoading') : t('queryResults')}
        </button>
        <button
          type="button"
          onClick={exportListPdf}
          disabled={loading || exporting || records.length === 0}
          className="rounded-xl bg-[#34C759] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2EB850] disabled:opacity-50"
        >
          {t('exportListPdf')}
        </button>
        <button
          type="button"
          onClick={exportPackZip}
          disabled={loading || exporting || records.length === 0}
          className="rounded-xl bg-[#5856D6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4B49B8] disabled:opacity-50"
        >
          {exporting ? t('exporting') : t('exportPrivateLedgerZip')}
        </button>
      </div>

      {hasSearched && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F9FAFB] px-4 py-3 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">
            {t('privateLedgerPreviewCount').replace('{{count}}', String(records.length))}
            {periodLabel ? ` · ${t('statisticsPeriod')}: ${periodLabel}` : ''}
          </div>
          {totals && (
            <div className="mt-1 text-xs text-gray-500">
              {t('totalIncome')}: {formatCurrency(locale, totals.totalIncome)} · {t('totalExpense')}:{' '}
              {formatCurrency(locale, totals.totalExpense)} · {t('balance')}:{' '}
              {formatCurrency(locale, totals.balance)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
