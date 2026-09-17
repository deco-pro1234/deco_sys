'use client'

import React, { useState, useEffect } from 'react'
import { getReportRecords, getReportActivities, getReportContracts, ReportFilter } from '../actions/report'
import { requestModifyRecord } from '../actions/modify'
import { deleteRecord } from '../actions/record'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import RecordDetailModal from '../RecordDetailModal'

type Props = {
  categories: any[]
  users: any[]
  pools: any[]
  locale: Locale
}

type ReportTab = 'records' | 'activities' | 'contracts'

function categoryPath(item: any) {
  return [item?.category?.name, item?.subCategory?.name, item?.thirdCategory?.name].filter(Boolean).join(' / ') || '-'
}

function attachmentCountOf(item: any) {
  const listed = Array.isArray(item?.attachments) ? item.attachments.length : 0
  if (listed > 0) return listed
  return item?.attachmentUrl ? 1 : 0
}

function safeFilePart(value: string, max = 36) {
  return String(value || '-')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max) || 'na'
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

function collectAttachmentUrls(record: any): string[] {
  const urls: string[] = []
  if (Array.isArray(record?.attachments)) {
    record.attachments.forEach((a: any) => {
      if (a?.fileUrl && !urls.includes(a.fileUrl)) urls.push(a.fileUrl)
    })
  }
  if (record?.attachmentUrl && !urls.includes(record.attachmentUrl)) {
    urls.push(record.attachmentUrl)
  }
  return urls
}

function csvEscape(value: string) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function ReportClient({ categories, users, pools, locale }: Props) {
  const t = createTranslator(locale)
  const dateLocale = locale === 'en' ? 'en-HK' : 'zh-HK'
  const [reportTab, setReportTab] = useState<ReportTab>('records')
  const [exportLocale, setExportLocale] = useState<Locale>(locale)

  useEffect(() => {
    setExportLocale(locale)
  }, [locale])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [noteKeyword, setNoteKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [poolId, setPoolId] = useState('')
  const [status, setStatus] = useState<'APPROVED' | 'PENDING' | 'ALL'>('APPROVED')
  const [userId, setUserId] = useState('')
  const [activityVisibility, setActivityVisibility] = useState<'ALL' | 'PUBLIC' | 'PRIVATE'>('ALL')
  const [contractType, setContractType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')

  const [records, setRecords] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fontBase64, setFontBase64] = useState<string | null>(null)

  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [selectedRecord, setSelectedRecord] = useState<any>(null)
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSubCategoryId, setEditSubCategoryId] = useState('')
  const [editThirdCategoryId, setEditThirdCategoryId] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editAttachments, setEditAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [editAttachmentNote, setEditAttachmentNote] = useState('')
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

  const currentCategory = categories.find((item) => item.id === categoryId)
  const currentSubCategory = currentCategory?.children?.find((item: any) => item.id === subCategoryId)
  const editCurrentCategory = categories.find((item) => item.id === editCategoryId)
  const editCurrentSubCategory = editCurrentCategory?.children?.find((item: any) => item.id === editSubCategoryId)

  const activeCount =
    reportTab === 'records' ? records.length : reportTab === 'activities' ? activities.length : contracts.length

  const handleEditClick = (record: any) => {
    setEditingRecord(record)
    setEditDate(new Date(record.date).toISOString().split('T')[0])
    setEditType(record.type as 'INCOME' | 'EXPENSE')
    setEditCategoryId(record.categoryId)
    setEditSubCategoryId(record.subCategoryId || '')
    setEditThirdCategoryId(record.thirdCategoryId || '')
    setEditAmount(Math.abs(record.amount).toString())
    setEditNote(record.note || '')
    setEditAttachments([])
    setOcrAttachmentIndex(0)
    setEditAttachmentNote('')
  }

  const submitEdit = async () => {
    if (!editCategoryId || !editAmount) return alert(t('selectedCategoryMissing'))
    setIsSubmittingEdit(true)

    let finalAmount = parseFloat(editAmount)
    if (editType === 'EXPENSE') finalAmount = -Math.abs(finalAmount)
    else finalAmount = Math.abs(finalAmount)

    const res = await requestModifyRecord(editingRecord.id, {
      type: editType,
      date: editDate,
      categoryId: editCategoryId,
      subCategoryId: editSubCategoryId,
      thirdCategoryId: editThirdCategoryId,
      amount: finalAmount,
      note: editNote,
      poolId: editingRecord.poolId,
      attachments:
        editAttachments.length > 0
          ? editAttachments.map((a) => ({
              url: a.url,
              size: a.size,
              note: a.note || editAttachmentNote || undefined,
            }))
          : undefined,
    })

    if (res.success) {
      alert(t('modifyRequestSubmitted'))
      setEditingRecord(null)
      handleSearch()
    } else {
      alert(`${t('submitFailed')}: ${res.error}`)
    }
    setIsSubmittingEdit(false)
  }

  const removeEditAttachmentAt = (index: number) => {
    const next = editAttachments.filter((_, i) => i !== index)
    let nextOcr = ocrAttachmentIndex
    if (index < ocrAttachmentIndex) nextOcr = ocrAttachmentIndex - 1
    else if (index === ocrAttachmentIndex) nextOcr = 0
    nextOcr = Math.min(nextOcr, Math.max(0, next.length - 1))
    setEditAttachments(next)
    setOcrAttachmentIndex(nextOcr)
    setEditAttachmentNote(next[nextOcr]?.note || '')
  }

  const handleEditAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const result = await prepareAttachments(file)
      if (result.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(result.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
      setEditAttachments(result.attachments)
      setOcrAttachmentIndex(0)
      setEditAttachmentNote(result.attachments[0]?.note || '')
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setEditAttachments([fallback])
        setOcrAttachmentIndex(0)
        setEditAttachmentNote(fallback.note || '')
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  const appendRecognizedText = (payload: OcrResolvedPayload | string) => {
    if (typeof payload === 'string') {
      setEditNote((current) => (current.trim() ? `${current.trim()}\n${payload}` : payload))
      return
    }
    if (payload.amount != null) {
      setEditAmount(String(Math.abs(payload.amount)))
    }
    if (payload.noteText) {
      setEditNote((current) => (current.trim() ? `${current.trim()}\n${payload.noteText}` : payload.noteText))
    }
    if (payload.attachmentMemo) {
      const ocrIndex = editAttachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0
      setEditAttachmentNote(payload.attachmentMemo)
      setEditAttachments((prev) =>
        prev.map((item, index) => (index === ocrIndex ? { ...item, note: payload.attachmentMemo } : item))
      )
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm(t('deleteRecordConfirm'))) return
    setLoading(true)
    const res = await deleteRecord(recordId)
    if (res.success) {
      handleSearch()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  useEffect(() => {
    const loadFont = async () => {
      try {
        const fontUrl = '/fonts/NotoSansSC-Regular.ttf'
        const res = await fetch(fontUrl)
        if (!res.ok) {
          throw new Error('字体文件获取失败: ' + res.statusText)
        }
        const buffer = await res.arrayBuffer()

        let binary = ''
        const bytes = new Uint8Array(buffer)
        const len = bytes.byteLength
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = window.btoa(binary)
        setFontBase64(base64)
      } catch (err) {
        console.error('加载中文字体失败:', err)
      }
    }
    loadFont()
  }, [])

  const buildDateRange = () => {
    const range: { startDate?: Date; endDate?: Date } = {}
    if (startDate) range.startDate = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      range.endDate = end
    }
    return range
  }

  const timeRangeLabel = () => {
    if (startDate && endDate) return `${startDate} – ${endDate}`
    if (startDate) return `${startDate} –`
    if (endDate) return `– ${endDate}`
    return t('allTime')
  }

  const handleSearch = async () => {
    setLoading(true)
    const range = buildDateRange()

    try {
      if (reportTab === 'records') {
        const filter: ReportFilter = { ...range, status }
        if (categoryId) filter.categoryId = categoryId
        if (subCategoryId) filter.subCategoryId = subCategoryId
        if (thirdCategoryId) filter.thirdCategoryId = thirdCategoryId
        if (poolId) filter.poolId = poolId
        if (userId) filter.userId = userId
        if (noteKeyword.trim()) filter.noteKeyword = noteKeyword.trim()
        setRecords(await getReportRecords(filter))
      } else if (reportTab === 'activities') {
        setActivities(await getReportActivities({
          ...range,
          userId: userId || undefined,
          noteKeyword: noteKeyword.trim() || undefined,
          visibility: activityVisibility,
        }))
      } else {
        setContracts(await getReportContracts({
          ...range,
          userId: userId || undefined,
          noteKeyword: noteKeyword.trim() || undefined,
          type: contractType,
          categoryId: categoryId || undefined,
          poolId: poolId || undefined,
        }))
      }
    } catch (err) {
      console.error(err)
      alert(t('queryFailed'))
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

  const exportListPdf = () => {
    const t = createTranslator(exportLocale)
    const dateLocale = exportLocale === 'en' ? 'en-HK' : 'zh-HK'
    const locale = exportLocale

    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    const totalCount = records.length
    let totalIncome = 0
    let totalExpense = 0
    records.forEach(r => {
      const val = Math.abs(r.amount)
      if (r.type === 'INCOME') totalIncome += val
      else if (r.type === 'EXPENSE') totalExpense += val
    })
    const balance = totalIncome - totalExpense

    const doc = createPdfDoc('landscape')
    const pageW = doc.internal.pageSize.getWidth()
    const marginX = 10

    doc.setFillColor(236, 242, 255)
    doc.rect(0, 0, pageW, 28, 'F')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(0, 122, 255)
    doc.text(t('financeSummaryReport'), pageW / 2, 12, { align: 'center' })
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    doc.text(`${t('statisticsPeriod')}: ${timeRangeLabel()}  ·  ${t('totalTransactions')}: ${totalCount}`, pageW / 2, 20, { align: 'center' })

    const categoryName = categoryId ? categories.find(c => c.id === categoryId)?.name || t('unknown') : t('all')
    const roleName = userId ? users.find(u => u.id === userId)?.roleName || t('unknown') : t('all')
    const poolName = poolId ? pools.find(p => p.id === poolId)?.name || t('unknown') : t('all')
    doc.setTextColor(130, 130, 140)
    doc.text(
      `${t('filterSummary')}: ${t('category')}[${categoryName}] · ${t('pool')}[${poolName}] · ${t('role')}[${roleName}] · ${t('reportNoteSearch')}[${noteKeyword.trim() || t('all')}]`,
      marginX,
      34
    )

    doc.setDrawColor(220, 225, 235)
    doc.setFillColor(250, 251, 253)
    doc.roundedRect(marginX, 38, pageW - marginX * 2, 22, 2, 2, 'FD')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(52, 199, 89)
    doc.text(`${t('totalIncome')}: ${totalIncome.toFixed(2)}`, marginX + 8, 51)
    doc.setTextColor(255, 59, 48)
    doc.text(`${t('totalExpense')}: ${totalExpense.toFixed(2)}`, marginX + 90, 51)
    doc.setTextColor(30, 30, 40)
    doc.text(`${t('balance')}: ${balance >= 0 ? '+' : ''}${balance.toFixed(2)}`, marginX + 175, 51)

    const categoryStats: Record<string, number> = {}
    let totalExpenseMerged = 0
    records.filter(r => r.type === 'EXPENSE').forEach(r => {
      const catName = r.category?.name || t('uncategorized')
      const val = Math.abs(r.amount)
      categoryStats[catName] = (categoryStats[catName] || 0) + val
      totalExpenseMerged += val
    })

    let yPos = 70
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(50, 50, 50)
    doc.text(t('categoryExpenseStats'), marginX, yPos)
    yPos += 8
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([name, amount], index) => {
      const percentage = totalExpenseMerged > 0 ? amount / totalExpenseMerged : 0
      doc.setTextColor(70, 70, 80)
      doc.text(`${name}: ${amount.toFixed(2)} (${(percentage * 100).toFixed(1)}%)`, marginX, yPos)
      doc.setFillColor(230, 232, 238)
      doc.roundedRect(marginX + 95, yPos - 3.5, 100, 5, 1.5, 1.5, 'F')
      const colors = [[0, 122, 255], [52, 199, 89], [255, 149, 0], [255, 59, 48], [88, 86, 214]]
      const color = index < colors.length ? colors[index] : [142, 142, 147]
      doc.setFillColor(color[0], color[1], color[2])
      doc.roundedRect(marginX + 95, yPos - 3.5, Math.max(100 * percentage, 1), 5, 1.5, 1.5, 'F')
      yPos += 9
    })

    doc.addPage('a4', 'landscape')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 30, 40)
    doc.text(t('detailListReport'), marginX, 12)
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    doc.text(
      `${t('totalIncome')}: ${totalIncome.toFixed(2)}   ${t('totalExpense')}: ${totalExpense.toFixed(2)}   ${t('balance')}: ${balance.toFixed(2)}`,
      marginX,
      19
    )

    const tableData = records.map(r => [
      r.id.slice(-8),
      new Date(r.date).toLocaleDateString(dateLocale),
      r.type === 'INCOME' ? t('income') : t('expense'),
      r.category?.name || '-',
      r.subCategory?.name || '-',
      r.thirdCategory?.name || '-',
      r.pool?.name || '-',
      r.user?.roleName || '-',
      formatCurrency(locale, r.amount),
      String(attachmentCountOf(r)),
      r.note || '-',
      r.status === 'PENDING' ? t('pendingApproval') : t('approvedStored'),
    ])

    autoTable(doc, {
      startY: 24,
      head: [[
        t('recordIdShort'),
        t('date'),
        t('type'),
        t('mainCategory'),
        t('subCategory'),
        t('grandCategory'),
        t('pool'),
        t('role'),
        t('amount'),
        t('attachmentCount'),
        t('note'),
        t('status'),
      ]],
      body: tableData,
      styles: {
        font: pdfFont(),
        fontSize: 7,
        cellPadding: 1.4,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [0, 122, 255],
        textColor: 255,
        font: pdfFont(),
        fontSize: 7,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 20 },
        2: { cellWidth: 14 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 24 },
        6: { cellWidth: 22 },
        7: { cellWidth: 18 },
        8: { cellWidth: 22 },
        9: { cellWidth: 12, halign: 'center' },
        10: { cellWidth: 'auto' },
        11: { cellWidth: 18 },
      },
    })

    doc.save(locale === 'en' ? 'financial-report-landscape.pdf' : '財務報表_明細列表.pdf')
  }

  const exportActivityListPdf = () => {
    const t = createTranslator(exportLocale)
    const dateLocale = exportLocale === 'en' ? 'en-HK' : 'zh-HK'
    const locale = exportLocale

    if (activities.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    const doc = createPdfDoc('landscape')
    const pageW = doc.internal.pageSize.getWidth()
    const marginX = 10

    doc.setFillColor(236, 242, 255)
    doc.rect(0, 0, pageW, 24, 'F')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(0, 122, 255)
    doc.text(t('activityListReport'), pageW / 2, 11, { align: 'center' })
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    doc.text(`${t('statisticsPeriod')}: ${timeRangeLabel()}  ·  ${activities.length} ${t('resultCount')}`, pageW / 2, 18, { align: 'center' })

    const tableData = activities.map(a => [
      a.id.slice(-8),
      a.title || '-',
      new Date(a.eventDate).toLocaleDateString(dateLocale),
      String(a.reminderDays ?? '-'),
      a.visibility === 'PRIVATE' ? t('privateActivity') : t('publicActivity'),
      a.user?.roleName || '-',
      String(attachmentCountOf(a)),
      a.note || '-',
    ])

    autoTable(doc, {
      startY: 28,
      head: [[
        t('recordIdShort'),
        t('activityTitle'),
        t('activityDate'),
        t('reminderDays'),
        t('activityVisibility'),
        t('role'),
        t('attachmentCount'),
        t('note'),
      ]],
      body: tableData,
      styles: { font: pdfFont(), fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 122, 255], textColor: 255, font: pdfFont(), fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    })

    doc.save(locale === 'en' ? 'activity-report.pdf' : '活動列表報表.pdf')
  }

  const exportContractListPdf = () => {
    const t = createTranslator(exportLocale)
    const dateLocale = exportLocale === 'en' ? 'en-HK' : 'zh-HK'
    const locale = exportLocale

    if (contracts.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    const doc = createPdfDoc('landscape')
    const pageW = doc.internal.pageSize.getWidth()
    const marginX = 10

    doc.setFillColor(236, 242, 255)
    doc.rect(0, 0, pageW, 24, 'F')
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(0, 122, 255)
    doc.text(t('contractListReport'), pageW / 2, 11, { align: 'center' })
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    doc.text(`${t('statisticsPeriod')}: ${timeRangeLabel()}  ·  ${contracts.length} ${t('resultCount')}`, pageW / 2, 18, { align: 'center' })

    const tableData = contracts.map(c => [
      c.id.slice(-8),
      c.title || '-',
      c.type === 'INCOME' ? t('income') : t('expense'),
      new Date(c.effectiveDate).toLocaleDateString(dateLocale),
      new Date(c.expiryDate).toLocaleDateString(dateLocale),
      c.category?.name || '-',
      c.subCategory?.name || '-',
      c.thirdCategory?.name || '-',
      c.pool?.name || '-',
      formatCurrency(locale, c.amount),
      c.user?.roleName || '-',
      String(attachmentCountOf(c)),
      c.note || '-',
    ])

    autoTable(doc, {
      startY: 28,
      head: [[
        t('recordIdShort'),
        t('contractTitle'),
        t('type'),
        t('effectiveDate'),
        t('expiryDate'),
        t('mainCategory'),
        t('subCategory'),
        t('grandCategory'),
        t('pool'),
        t('amount'),
        t('role'),
        t('attachmentCount'),
        t('note'),
      ]],
      body: tableData,
      styles: { font: pdfFont(), fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 122, 255], textColor: 255, font: pdfFont(), fontSize: 7, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    })

    doc.save(locale === 'en' ? 'contract-report.pdf' : '合約列表報表.pdf')
  }

  const exportAccountingPdfs = async () => {
    const t = createTranslator(exportLocale)
    const dateLocale = exportLocale === 'en' ? 'en-HK' : 'zh-HK'
    const locale = exportLocale

    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    setExporting(true)
    try {
      const zip = new JSZip()
      const voucherFolderName = t('attachmentsFolder')
      const attFolder = zip.folder(voucherFolderName)

      const totalCount = records.length
      let totalIncome = 0
      let totalExpense = 0
      records.forEach(r => {
        const val = Math.abs(r.amount)
        if (r.type === 'INCOME') totalIncome += val
        else if (r.type === 'EXPENSE') totalExpense += val
      })
      const balance = totalIncome - totalExpense

      const categoryName = categoryId ? categories.find(c => c.id === categoryId)?.name || t('unknown') : t('all')
      const roleName = userId ? users.find(u => u.id === userId)?.roleName || t('unknown') : t('all')
      const poolName = poolId ? pools.find(p => p.id === poolId)?.name || t('unknown') : t('all')
      const noteKeywordLabel = noteKeyword.trim() || t('all')
      const genDate = new Date().toLocaleString(dateLocale)
      const ymd = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${ymd.getFullYear()}${pad(ymd.getMonth() + 1)}${pad(ymd.getDate())}`

      type PreparedRow = {
        record: any
        voucherNo: string
        dateStr: string
        typeLabel: string
        amountAbs: number
        fileNames: string[]
      }

      const prepared: PreparedRow[] = []
      const csvRows: string[] = []
      csvRows.push([
        t('voucherNo'),
        t('date'),
        t('type'),
        t('mainCategory'),
        t('subCategory'),
        t('grandCategory'),
        t('pool'),
        t('role'),
        t('amount'),
        t('note'),
        t('status'),
        t('recordId'),
        t('voucherFile'),
      ].map(csvEscape).join(','))

      for (let i = 0; i < totalCount; i++) {
        const r = records[i]
        const voucherNo = padVoucherNo(i + 1)
        const dateObj = new Date(r.date)
        const dateStr = dateObj.toLocaleDateString(dateLocale)
        const isoDay = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`
        const typeLabel = r.type === 'INCOME' ? t('income') : t('expense')
        const typeCode = r.type === 'INCOME' ? 'IN' : 'EX'
        const amountAbs = Math.abs(Number(r.amount) || 0)
        const catLeaf = r.thirdCategory?.name || r.subCategory?.name || r.category?.name || 'na'
        const urls = collectAttachmentUrls(r)
        const fileNames: string[] = []

        if (urls.length === 0) {
          csvRows.push([
            voucherNo, dateStr, typeLabel,
            r.category?.name || '-', r.subCategory?.name || '-', r.thirdCategory?.name || '-',
            r.pool?.name || '-', r.user?.roleName || '-',
            amountAbs.toFixed(2), r.note || '-',
            r.status === 'PENDING' ? t('pendingApproval') : t('approvedStored'),
            r.id, t('noVoucher'),
          ].map(csvEscape).join(','))
        } else {
          urls.forEach((dataUrl, k) => {
            const ext = extFromDataUrl(dataUrl)
            const suffix = urls.length > 1 ? `_${k + 1}` : ''
            const fileName = [
              voucherNo + suffix,
              isoDay,
              typeCode,
              safeFilePart(catLeaf, 24),
              amountAbs.toFixed(2),
            ].join('_') + `.${ext}`
            fileNames.push(fileName)

            if (attFolder && dataUrl.startsWith('data:')) {
              const bytes = dataUrlToUint8(dataUrl)
              if (bytes) attFolder.file(fileName, bytes)
            }

            csvRows.push([
              voucherNo, dateStr, typeLabel,
              r.category?.name || '-', r.subCategory?.name || '-', r.thirdCategory?.name || '-',
              r.pool?.name || '-', r.user?.roleName || '-',
              amountAbs.toFixed(2), r.note || '-',
              r.status === 'PENDING' ? t('pendingApproval') : t('approvedStored'),
              r.id, `${voucherFolderName}/${fileName}`,
            ].map(csvEscape).join(','))
          })
        }

        prepared.push({ record: r, voucherNo, dateStr, typeLabel, amountAbs, fileNames })
      }

      zip.file(t('voucherIndexCsv'), '\uFEFF' + csvRows.join('\n'))

      // —— PDF: formal accounting pack ——
      const doc = createPdfDoc('portrait')
      const pageW = doc.internal.pageSize.getWidth()
      const ink: [number, number, number] = [28, 35, 45]
      const muted: [number, number, number] = [100, 110, 120]
      const line: [number, number, number] = [210, 215, 220]
      const accent: [number, number, number] = [30, 58, 95]
      const mx = 16

      // Cover header band
      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, pageW, 36, 'F')
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(255, 255, 255)
      doc.text(t('accountingPackTitle'), mx, 16)
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(10)
      doc.text(t('preparedForAccountant'), mx, 26)

      doc.setTextColor(ink[0], ink[1], ink[2])
      doc.setFontSize(11)
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.text(`${t('statisticsPeriod')}`, mx, 50)
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.text(timeRangeLabel(), mx + 40, 50)
      doc.setTextColor(muted[0], muted[1], muted[2])
      doc.setFontSize(9)
      doc.text(`${t('generated')}: ${genDate}`, mx, 58)
      doc.text(t('currencyUnit'), mx + 110, 58)

      // KPI boxes
      const boxY = 68
      const boxH = 28
      const gap = 4
      const boxW = (pageW - mx * 2 - gap * 3) / 4
      const kpis = [
        { label: t('totalTransactions'), value: String(totalCount), color: ink },
        { label: t('totalIncome'), value: totalIncome.toFixed(2), color: [34, 120, 80] as [number, number, number] },
        { label: t('totalExpense'), value: totalExpense.toFixed(2), color: [170, 50, 45] as [number, number, number] },
        { label: t('balance'), value: `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}`, color: ink },
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

      // Filters
      let y = 110
      if (fontBase64) doc.setFont('NotoSansSC', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(ink[0], ink[1], ink[2])
      doc.text(t('filterSummary'), mx, y)
      y += 7
      if (fontBase64) doc.setFont('NotoSansSC', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(muted[0], muted[1], muted[2])
      const filterLines = [
        `${t('category')}: ${categoryName}`,
        `${t('pool')}: ${poolName}`,
        `${t('role')}: ${roleName}`,
        `${t('reportNoteSearch')}: ${noteKeywordLabel}`,
        `${t('status')}: ${status === 'ALL' ? t('all') : status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}`,
      ]
      filterLines.forEach((lineText) => {
        doc.text(lineText, mx, y)
        y += 5.5
      })

      y += 6
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

      // Category expense table
      const categoryStats: Record<string, number> = {}
      records.filter(r => r.type === 'EXPENSE').forEach(r => {
        const catName = r.category?.name || t('uncategorized')
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
          head: [[t('mainCategory'), t('amount'), '%']],
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

      // Landscape ledger
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
      doc.text(`${t('statisticsPeriod')}: ${timeRangeLabel()}  ·  ${totalCount} ${t('resultCount')}`, landW - 12, 12, { align: 'right' })

      const ledgerBody = prepared.map((row) => {
        const r = row.record
        return [
          row.voucherNo,
          row.dateStr,
          row.typeLabel,
          r.category?.name || '-',
          r.subCategory?.name || '-',
          r.thirdCategory?.name || '-',
          r.pool?.name || '-',
          r.user?.roleName || '-',
          formatCurrency(locale, r.amount),
          r.note || '-',
          row.fileNames.length > 0 ? row.fileNames.join('; ') : t('noVoucher'),
        ]
      })

      autoTable(doc, {
        startY: 24,
        head: [[
          t('voucherNo'),
          t('date'),
          t('type'),
          t('mainCategory'),
          t('subCategory'),
          t('grandCategory'),
          t('pool'),
          t('role'),
          t('amount'),
          t('note'),
          t('voucherFile'),
        ]],
        body: ledgerBody,
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
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 20 },
          2: { cellWidth: 14 },
          3: { cellWidth: 24 },
          4: { cellWidth: 24 },
          5: { cellWidth: 24 },
          6: { cellWidth: 22 },
          7: { cellWidth: 18 },
          8: { cellWidth: 22, halign: 'right' },
          9: { cellWidth: 36 },
          10: { cellWidth: 'auto' },
        },
      })

      // Page footers
      const pageCount = doc.getNumberOfPages()
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const w = doc.internal.pageSize.getWidth()
        const h = doc.internal.pageSize.getHeight()
        doc.setDrawColor(line[0], line[1], line[2])
        doc.line(10, h - 10, w - 10, h - 10)
        doc.setFontSize(7)
        doc.setTextColor(muted[0], muted[1], muted[2])
        if (fontBase64) doc.setFont('NotoSansSC', 'normal')
        doc.text(t('accountingPackTitle'), 10, h - 5)
        doc.text(`${p} / ${pageCount}`, w - 10, h - 5, { align: 'right' })
      }

      const pdfName = locale === 'en' ? `01_Accounting_Pack_${stamp}.pdf` : `01_會計結算報表_${stamp}.pdf`
      zip.file(pdfName, doc.output('blob'))

      const zipContent = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(zipContent)
      const link = document.createElement('a')
      link.href = url
      link.download = locale === 'en' ? `Accounting_Pack_${stamp}.zip` : `會計結算包_${stamp}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert(t('zipExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const inputClass = 'w-full border border-transparent bg-white/80 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]/40 outline-none transition-all text-gray-900 shadow-sm'
  const tabClass = (active: boolean) =>
    `flex-1 min-w-[7rem] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
      active
        ? 'bg-white text-[#007AFF] shadow-sm ring-1 ring-black/5'
        : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
    }`

  const hintText =
    reportTab === 'records'
      ? t('reportRecordsHint')
      : reportTab === 'activities'
        ? t('reportActivitiesHint')
        : t('reportContractsHint')

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/60 bg-gradient-to-br from-[#EEF4FF] via-white to-[#F7F8FA] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#007AFF]/80">{t('report')}</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">{t('financeReportExport')}</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-gray-500">{hintText}</p>
          </div>
          {activeCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-[#007AFF]/10 px-3 py-1.5 text-xs font-semibold text-[#007AFF]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
              {activeCount} {t('resultCount')}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-1 rounded-2xl bg-black/[0.04] p-1">
          <button type="button" className={tabClass(reportTab === 'records')} onClick={() => setReportTab('records')}>
            {t('reportTabRecords')}
          </button>
          <button type="button" className={tabClass(reportTab === 'activities')} onClick={() => setReportTab('activities')}>
            {t('reportTabActivities')}
          </button>
          <button type="button" className={tabClass(reportTab === 'contracts')} onClick={() => setReportTab('contracts')}>
            {t('reportTabContracts')}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('startDate')}</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('endDate')}</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              {reportTab === 'records' ? t('reportNoteSearch') : t('reportKeywordSearch')}
            </label>
            <input
              type="text"
              value={noteKeyword}
              onChange={e => setNoteKeyword(e.target.value)}
              placeholder={reportTab === 'records' ? t('reportNoteSearchPlaceholder') : t('reportKeywordPlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('role')}</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className={inputClass}>
              <option value="">{t('all')}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.roleName}</option>
              ))}
            </select>
          </div>

          {reportTab === 'records' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('mainCategory')}</label>
                <select
                  value={categoryId}
                  onChange={e => {
                    setCategoryId(e.target.value)
                    setSubCategoryId('')
                    setThirdCategoryId('')
                  }}
                  className={inputClass}
                >
                  <option value="">{t('all')}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('subCategory')}</label>
                <select value={subCategoryId} onChange={e => { setSubCategoryId(e.target.value); setThirdCategoryId('') }} className={inputClass} disabled={!currentCategory?.children?.length}>
                  <option value="">{t('all')}</option>
                  {currentCategory?.children?.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('grandCategory')}</label>
                <select value={thirdCategoryId} onChange={e => setThirdCategoryId(e.target.value)} className={inputClass} disabled={!currentSubCategory?.children?.length}>
                  <option value="">{t('all')}</option>
                  {currentSubCategory?.children?.map((third: any) => (
                    <option key={third.id} value={third.id}>{third.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('pool')}</label>
                <select value={poolId} onChange={e => setPoolId(e.target.value)} className={inputClass}>
                  <option value="">{t('all')}</option>
                  {pools.map((pool: any) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('status')}</label>
                <select value={status} onChange={e => setStatus(e.target.value as 'APPROVED' | 'PENDING' | 'ALL')} className={inputClass}>
                  <option value="APPROVED">{t('approvedStored')}</option>
                  <option value="PENDING">{t('pendingApproval')}</option>
                  <option value="ALL">{t('all')}</option>
                </select>
              </div>
            </>
          )}

          {reportTab === 'activities' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('activityVisibility')}</label>
              <select value={activityVisibility} onChange={e => setActivityVisibility(e.target.value as 'ALL' | 'PUBLIC' | 'PRIVATE')} className={inputClass}>
                <option value="ALL">{t('all')}</option>
                <option value="PUBLIC">{t('publicActivity')}</option>
                <option value="PRIVATE">{t('privateActivity')}</option>
              </select>
            </div>
          )}

          {reportTab === 'contracts' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('type')}</label>
                <select value={contractType} onChange={e => setContractType(e.target.value as 'ALL' | 'INCOME' | 'EXPENSE')} className={inputClass}>
                  <option value="ALL">{t('all')}</option>
                  <option value="INCOME">{t('income')}</option>
                  <option value="EXPENSE">{t('expense')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('mainCategory')}</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputClass}>
                  <option value="">{t('all')}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('pool')}</label>
                <select value={poolId} onChange={e => setPoolId(e.target.value)} className={inputClass}>
                  <option value="">{t('all')}</option>
                  {pools.map((pool: any) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-[#007AFF]/15 bg-[#007AFF]/5 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('exportLanguage')}</label>
            <p className="text-xs text-gray-500 mt-0.5">{t('exportLanguageHint')}</p>
          </div>
          <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => setExportLocale('zh-HK')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                exportLocale === 'zh-HK' ? 'bg-[#007AFF] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('traditionalChinese')}
            </button>
            <button
              type="button"
              onClick={() => setExportLocale('en')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                exportLocale === 'en' ? 'bg-[#007AFF] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('english')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mb-6">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? t('queryLoading') : t('queryResults')}
          </button>

          {reportTab === 'records' && (
            <>
              <button
                onClick={exportListPdf}
                disabled={loading || exporting || records.length === 0}
                className="px-5 py-2.5 bg-[#34C759] text-white rounded-xl text-sm font-semibold hover:bg-[#2EB850] transition-colors shadow-sm disabled:opacity-50"
              >
                {t('exportListPdf')}
              </button>
              <button
                onClick={exportAccountingPdfs}
                disabled={loading || exporting || records.length === 0}
                className="px-5 py-2.5 bg-[#5856D6] text-white rounded-xl text-sm font-semibold hover:bg-[#4B49B8] transition-colors shadow-sm disabled:opacity-50"
              >
                {exporting ? t('exporting') : t('exportAccountingZip')}
              </button>
            </>
          )}

          {reportTab === 'activities' && (
            <button
              onClick={exportActivityListPdf}
              disabled={loading || activities.length === 0}
              className="px-5 py-2.5 bg-[#34C759] text-white rounded-xl text-sm font-semibold hover:bg-[#2EB850] transition-colors shadow-sm disabled:opacity-50"
            >
              {t('exportActivityListPdf')}
            </button>
          )}

          {reportTab === 'contracts' && (
            <button
              onClick={exportContractListPdf}
              disabled={loading || contracts.length === 0}
              className="px-5 py-2.5 bg-[#34C759] text-white rounded-xl text-sm font-semibold hover:bg-[#2EB850] transition-colors shadow-sm disabled:opacity-50"
            >
              {t('exportContractListPdf')}
            </button>
          )}
        </div>

        {reportTab === 'records' && (
          <div className="rounded-2xl border border-gray-100 overflow-hidden bg-[#FAFBFC]">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-white text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('date')}</th>
                    <th className="px-4 py-3 font-semibold">{t('type')}</th>
                    <th className="px-4 py-3 font-semibold">{t('categoryPath')}</th>
                    <th className="px-4 py-3 font-semibold">{t('role')}</th>
                    <th className="px-4 py-3 font-semibold">{t('pool')}</th>
                    <th className="px-4 py-3 font-semibold">{t('amount')}</th>
                    <th className="px-4 py-3 font-semibold">{t('attachmentCount')}</th>
                    <th className="px-4 py-3 font-semibold">{t('note')}</th>
                    <th className="px-4 py-3 font-semibold">{t('status')}</th>
                    <th className="px-4 py-3 font-semibold">{t('modify')}</th>
                    <th className="px-4 py-3 font-semibold">{t('detail')}</th>
                    <th className="px-4 py-3 font-semibold">{t('delete')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</td>
                    </tr>
                  ) : (
                    records.map(record => (
                      <tr key={record.id} className="hover:bg-[#F8FAFF] transition-colors">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{new Date(record.date).toLocaleDateString(dateLocale)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                            record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                          }`}>
                            {record.type === 'INCOME' ? t('income') : t('expense')}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">{categoryPath(record)}</td>
                        <td className="px-4 py-3">{record.user?.roleName || '-'}</td>
                        <td className="px-4 py-3">{record.pool?.name || '-'}</td>
                        <td className={`px-4 py-3 font-bold whitespace-nowrap ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                          {formatCurrency(locale, record.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">{attachmentCountOf(record)}</td>
                        <td className="px-4 py-3 max-w-[160px] truncate text-gray-500" title={record.note || ''}>{record.note || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-md ${record.status === 'PENDING' ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#34C759]/10 text-[#34C759]'}`}>
                            {record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {!record.isReviewing ? (
                            <button onClick={() => handleEditClick(record)} className="text-[#007AFF] hover:underline font-medium text-sm">{t('modify')}</button>
                          ) : (
                            <span className="text-xs text-[#FF9500] font-medium">{t('modifyPending')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] hover:underline font-medium text-sm">{t('detail')}</button>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDeleteRecord(record.id)} className="text-[#FF3B30] hover:underline font-medium text-sm">{t('delete')}</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-gray-100 bg-white">
              {records.length === 0 ? (
                <div className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</div>
              ) : (
                records.map(record => (
                  <div key={record.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{new Date(record.date).toLocaleDateString(dateLocale)}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                        }`}>
                          {record.type === 'INCOME' ? t('income') : t('expense')}
                        </span>
                      </div>
                      <span className={`font-bold text-sm ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                        {formatCurrency(locale, record.amount)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{categoryPath(record)}</div>
                    <div className="text-xs text-gray-400">
                      {t('pool')}: {record.pool?.name || '-'} · {t('attachmentCount')}: {attachmentCountOf(record)}
                    </div>
                    {record.note && <div className="text-xs text-gray-500 truncate">{record.note}</div>}
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-400">{record.user?.roleName || '-'} · {record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">{t('detail')}</button>
                        {!record.isReviewing && (
                          <button onClick={() => handleEditClick(record)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">{t('modify')}</button>
                        )}
                        <button onClick={() => handleDeleteRecord(record.id)} className="text-[#FF3B30] font-medium text-xs bg-[#FF3B30]/10 px-3 py-1 rounded">{t('delete')}</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {reportTab === 'activities' && (
          <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700 min-w-[720px]">
                <thead className="bg-[#FAFBFC] text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('activityTitle')}</th>
                    <th className="px-4 py-3 font-semibold">{t('activityDate')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reminderDays')}</th>
                    <th className="px-4 py-3 font-semibold">{t('activityVisibility')}</th>
                    <th className="px-4 py-3 font-semibold">{t('role')}</th>
                    <th className="px-4 py-3 font-semibold">{t('attachmentCount')}</th>
                    <th className="px-4 py-3 font-semibold">{t('note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activities.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</td>
                    </tr>
                  ) : (
                    activities.map(item => (
                      <tr key={item.id} className="hover:bg-[#F8FAFF]">
                        <td className="px-4 py-3 font-medium">{item.title}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(item.eventDate).toLocaleDateString(dateLocale)}</td>
                        <td className="px-4 py-3">{item.reminderDays}</td>
                        <td className="px-4 py-3">{item.visibility === 'PRIVATE' ? t('privateActivity') : t('publicActivity')}</td>
                        <td className="px-4 py-3">{item.user?.roleName || '-'}</td>
                        <td className="px-4 py-3 text-center">{attachmentCountOf(item)}</td>
                        <td className="px-4 py-3 max-w-[220px] truncate text-gray-500">{item.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportTab === 'contracts' && (
          <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700 min-w-[960px]">
                <thead className="bg-[#FAFBFC] text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('contractTitle')}</th>
                    <th className="px-4 py-3 font-semibold">{t('type')}</th>
                    <th className="px-4 py-3 font-semibold">{t('effectiveDate')}</th>
                    <th className="px-4 py-3 font-semibold">{t('expiryDate')}</th>
                    <th className="px-4 py-3 font-semibold">{t('categoryPath')}</th>
                    <th className="px-4 py-3 font-semibold">{t('pool')}</th>
                    <th className="px-4 py-3 font-semibold">{t('amount')}</th>
                    <th className="px-4 py-3 font-semibold">{t('role')}</th>
                    <th className="px-4 py-3 font-semibold">{t('attachmentCount')}</th>
                    <th className="px-4 py-3 font-semibold">{t('note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</td>
                    </tr>
                  ) : (
                    contracts.map(item => (
                      <tr key={item.id} className="hover:bg-[#F8FAFF]">
                        <td className="px-4 py-3 font-medium">{item.title}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                            item.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                          }`}>
                            {item.type === 'INCOME' ? t('income') : t('expense')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(item.effectiveDate).toLocaleDateString(dateLocale)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(item.expiryDate).toLocaleDateString(dateLocale)}</td>
                        <td className="px-4 py-3 max-w-[200px]">{categoryPath(item)}</td>
                        <td className="px-4 py-3">{item.pool?.name || '-'}</td>
                        <td className={`px-4 py-3 font-bold whitespace-nowrap ${item.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                          {formatCurrency(locale, item.amount)}
                        </td>
                        <td className="px-4 py-3">{item.user?.roleName || '-'}</td>
                        <td className="px-4 py-3 text-center">{attachmentCountOf(item)}</td>
                        <td className="px-4 py-3 max-w-[180px] truncate text-gray-500">{item.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editingRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">{t('editRecordRequest')}</h3>
              <button onClick={() => setEditingRecord(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto">
              <div className="flex space-x-3 mb-2 md:mb-4">
                <button
                  className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${editType === 'EXPENSE' ? 'bg-[#FF3B30] text-white' : 'bg-[#F2F2F7] text-gray-600'}`}
                  onClick={() => { setEditType('EXPENSE'); setEditCategoryId(''); setEditSubCategoryId(''); }}
                >
                  {t('expense')}
                </button>
                <button
                  className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${editType === 'INCOME' ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-gray-600'}`}
                  onClick={() => { setEditType('INCOME'); setEditCategoryId(''); setEditSubCategoryId(''); }}
                >
                  {t('income')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('date')}</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('mainCategory')}</label>
                  <select value={editCategoryId} onChange={e => { setEditCategoryId(e.target.value); setEditSubCategoryId(''); setEditThirdCategoryId(''); }} className={inputClass}>
                    <option value="">{t('selectCategory')}</option>
                    {categories.filter(c => c.type === editType && !c.parentId).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('amount')} (HKD$)</label>
                  <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('subCategory')}</label>
                  <select value={editSubCategoryId} onChange={e => { setEditSubCategoryId(e.target.value); setEditThirdCategoryId('') }} className={inputClass}>
                    <option value="">{t('noSubCategory')}</option>
                    {editCurrentCategory?.children?.map((sub: any) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('grandCategory')}</label>
                  <select value={editThirdCategoryId} onChange={e => setEditThirdCategoryId(e.target.value)} className={inputClass}>
                    <option value="">{t('noGrandCategory')}</option>
                    {editCurrentSubCategory?.children?.map((third: any) => (
                      <option key={third.id} value={third.id}>{third.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('note')}</label>
                  <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className={inputClass} placeholder={t('noteLongPlaceholder')} />
                </div>

                <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 p-4 bg-[#F2F2F7]/50">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-xs font-semibold text-gray-500 uppercase">{t('appendAttachment')} <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span></label>
                    <OcrNoteButton
                      locale={locale}
                      attachments={editAttachments}
                      context="record-edit"
                      onResolved={appendRecognizedText}
                      disabled={isSubmittingEdit}
                    />
                  </div>
                  <input type="file" accept="image/*,application/pdf" onChange={handleEditAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF]" />
                  <input
                    type="text"
                    value={editAttachmentNote}
                    onChange={(e) => {
                      const value = e.target.value
                      setEditAttachmentNote(value)
                      setEditAttachments((prev) =>
                        prev.map((item, index) =>
                          index === (editAttachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0)
                            ? { ...item, note: value }
                            : item
                        )
                      )
                    }}
                    placeholder={t('attachmentTypePlaceholder')}
                    className={`${inputClass} mt-3`}
                  />
                  {editAttachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {editAttachments.length > 1 && (
                        <div className="text-xs font-medium text-[#007AFF]">
                          {t('pdfPagesReady').replace('{{count}}', String(editAttachments.length))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {editAttachments.map((item, index) => (
                          <div
                            key={`${item.size}-${index}-${item.pageIndex || 0}`}
                            className={`relative rounded-lg border p-1 ${
                              index === ocrAttachmentIndex ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20' : 'border-gray-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOcrAttachmentIndex(index)
                                setEditAttachmentNote(item.note || '')
                              }}
                              className="block"
                            >
                              <img src={item.url} alt="" className="h-16 w-16 rounded object-cover" />
                              {(item.pageIndex || editAttachments.length > 1) && (
                                <div className="mt-0.5 text-center text-[10px] text-gray-500">
                                  {item.pageIndex ?? index + 1}
                                </div>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeEditAttachmentAt(index)}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] leading-none text-white"
                              aria-label={t('delete')}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold shadow-sm transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={submitEdit}
                  disabled={isSubmittingEdit}
                  className="flex-1 py-3 bg-[#007AFF] hover:bg-[#0066CC] text-white rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {t('saveAndSubmitReview')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRecord && (
        <RecordDetailModal record={selectedRecord} locale={locale} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  )
}
