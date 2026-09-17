import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SnapshotProfile } from './calc';
import { loadChineseFonts } from '@/lib/fonts/loadChineseFont';

export type FontPack = {
  regular: Uint8Array | null;
  bold: Uint8Array | null;
  regularFamily: string;
  boldFamily: string;
  cjkAvailable: boolean;
};

export type PdfLocale = 'bilingual' | 'zh' | 'en';

export type SystemSettingMap = {
  COMPANY_NAME_ZH?: string;
  COMPANY_NAME_EN?: string;
  COMPANY_ADDRESS?: string;
  COMPANY_PHONE?: string;
};

export type PdfPayrollItemRow = {
  itemType: 'EARNING' | 'DEDUCTION';
  itemCode: string;
  itemName: string;
  amountHkd: number;
  sourceText?: string | null;
};

export type GeneratePayslipPdfInput = {
  company: SystemSettingMap;
  profile: SnapshotProfile;
  payroll: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    payrollDate: Date;
    currency?: string;
    baseSalaryHkd: number;
    overtimeHkd: number;
    bonusHkd: number;
    commissionHkd: number;
    allowanceTotalHkd: number;
    deductionTotalHkd: number;
    grossTotalHkd: number;
    netPayableHkd: number;
    submittedAt?: Date | null;
    confirmedAt?: Date | null;
    paidAt?: Date | null;
    pdfGeneratedAt?: Date | null;
    adminNote?: string | null;
  };
  items: PdfPayrollItemRow[];
  submittedBy?: { legalNameZh?: string | null; legalNameEn?: string } | null;
  cycleNote?: string | null;
};

function formatHkd(value: number): string {
  return value.toLocaleString('en-HK', {
    style: 'currency',
    currency: 'HKD',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace('HKD', 'HKD ');
}

function shortDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

type L = Record<'zh' | 'en' | 'bilingual', string>;
const label = (k: L, locale: PdfLocale): string => {
  if (locale === 'zh') return k.zh;
  if (locale === 'en') return k.en;
  return k.bilingual; // zh + en 並列
};
const T = {
  payslipTitle: {
    zh: '支 薪 證 明',
    en: 'PAYSLIP CERTIFICATE',
    bilingual: 'PAYSLIP CERTIFICATE\n支 薪 證 明',
  } as L,
  employeeBlock: { zh: '僱員資料', en: 'Employee Info', bilingual: 'Employee / 僱員資料' } as L,
  nameEn: { zh: '英文姓名', en: 'Name (EN)', bilingual: 'Name (EN) / 英文姓名' } as L,
  nameZh: { zh: '中文姓名', en: 'Name (ZH)', bilingual: 'Name (中) / 中文姓名' } as L,
  hkid: { zh: '身份證/護照', en: 'HKID / Passport', bilingual: 'HKID/Passport / 身份證/護照' } as L,
  mpfNo: { zh: '強積金帳號', en: 'MPF No.', bilingual: 'MPF No. / 強積金帳號' } as L,
  contact: { zh: '聯絡資訊', en: 'Contact', bilingual: 'Contact / 聯絡資訊' } as L,
  department: { zh: '部門', en: 'Department', bilingual: 'Department / 部門' } as L,
  jobTitle: { zh: '職稱', en: 'Job Title', bilingual: 'Job Title / 職稱' } as L,
  dateJoined: { zh: '入職日期', en: 'Date Joined', bilingual: 'Date Joined / 入職日' } as L,
  bank: { zh: '銀行帳號', en: 'Bank', bilingual: 'Bank / 銀行' } as L,
  dob: { zh: '出生日期', en: 'DOB', bilingual: 'DOB / 出生日期' } as L,
  incomeTableHead: { zh: '收入項目', en: 'Income Items', bilingual: 'Income / 收入項目' } as L,
  deductionTableHead: { zh: '扣除項目', en: 'Deductions', bilingual: 'Deductions / 扣除項目' } as L,
  code: { zh: '編碼', en: 'Code', bilingual: 'Code / 編碼' } as L,
  amount: { zh: '金額', en: 'Amount', bilingual: 'Amount / 金額' } as L,
  grossTotal: { zh: '收入總額', en: 'Gross Total', bilingual: 'Gross Total / 收入總額' } as L,
  deductionTotal: { zh: '扣除總額', en: 'Deduction Total', bilingual: 'Deduction Total / 扣除總額' } as L,
  netPayable: { zh: '應發淨額', en: 'Net Payable', bilingual: 'Net Payable / 應發淨額' } as L,
  issuedBy: { zh: '發出人（管理員）', en: 'Issued by', bilingual: 'Issued by / 發出人（管理員）' } as L,
  acknowledgedBy: { zh: '僱員確認', en: 'Acknowledged by', bilingual: 'Acknowledged by / 僱員確認' } as L,
  paid: { zh: '已發薪', en: 'Paid', bilingual: 'Paid / 已發薪' } as L,
  notYetPaid: { zh: '尚未發薪', en: 'Not yet paid', bilingual: 'Not yet paid / 尚未發薪' } as L,
  confirmed: { zh: '已確認（電子接受）', en: 'Confirmed (Electronic Acceptance)', bilingual: 'Confirmed / 已確認（電子接受）' } as L,
  footerNote: {
    zh: '此支薪證明為電腦簽發，毋須蓋章。',
    en: 'This payslip is computer-generated, no stamp required.',
    bilingual: '此支薪證明為電腦簽發，毋須蓋章。This payslip is computer-generated, no stamp required.',
  } as L,
  note: { zh: '備註', en: 'Note', bilingual: 'Note / 備註' } as L,
};

function numberToEnglishWords(n: number): string {
  // HKD amount in English, pragmatic for common salary ranges
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scale = [
    { v: 1e9, label: 'Billion' },
    { v: 1e6, label: 'Million' },
    { v: 1e3, label: 'Thousand' },
    { v: 1, label: '' },
  ];
  const cents = Math.round((n - Math.floor(n)) * 100);
  const whole = Math.floor(n);
  if (whole === 0 && cents === 0) return 'Hong Kong Dollars Zero Only.';
  const wordify = (x: number): string => {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    if (x < 100) return (tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : '')).trim();
    if (x < 1000) {
      const h = Math.floor(x / 100);
      const rest = x % 100;
      return (ones[h] + ' Hundred' + (rest ? ' and ' + wordify(rest) : '')).trim();
    }
    for (const s of scale) {
      if (x >= s.v) {
        const hi = Math.floor(x / s.v);
        const lo = x % s.v;
        const label = s.label ? ' ' + s.label : '';
        return (wordify(hi) + label + (lo ? ' ' + wordify(lo) : '')).trim();
      }
    }
    return '';
  };
  let result = wordify(whole).replace(/\s+/g, ' ').trim();
  if (cents > 0) {
    result += ` and Cents ${wordify(cents).replace(/\s+/g, ' ').trim()}`;
  }
  return `Hong Kong Dollars ${result} Only.`;
}

function _toBinaryStr(bytes: Uint8Array): string {
  let bin = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}

export function registerFonts(doc: jsPDF, pack: FontPack): { fontReg: string; fontBold: string; cjk: boolean } {
  let fontReg = 'helvetica';
  let fontBold = 'helvetica';
  let cjk = false;
  if (pack.cjkAvailable && pack.regular) {
    try {
      fontReg = pack.regularFamily;
      fontBold = pack.boldFamily;
      doc.addFileToVFS(`${fontReg}.ttf`, _toBinaryStr(pack.regular));
      doc.addFont(`${fontReg}.ttf`, fontReg, 'normal');
      if (pack.bold && pack.boldFamily !== pack.regularFamily) {
        doc.addFileToVFS(`${fontBold}.ttf`, _toBinaryStr(pack.bold));
        doc.addFont(`${fontBold}.ttf`, fontBold, 'bold');
      } else {
        doc.addFont(`${fontReg}.ttf`, fontBold, 'bold');
      }
      cjk = true;
    } catch (e) {
      console.error('[pdf.registerFonts] CJK font register failed, fallback helvetica:', String(e));
      fontReg = 'helvetica';
      fontBold = 'helvetica';
      cjk = false;
    }
  }
  return { fontReg, fontBold, cjk };
}

export function generateFallbackEnPdf(input: GeneratePayslipPdfInput, errorMsg?: string, locale: PdfLocale = 'en'): Uint8Array {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;
    doc.text(input.company.COMPANY_NAME_EN || 'SK11 Finance Limited', pageW / 2, y, { align: 'center' });
    y += 22;
    doc.setFontSize(14);
    doc.text('PAYSLIP CERTIFICATE', pageW / 2, y, { align: 'center' });
    y += 26;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const snap = input.profile;
    doc.text(`Payslip No.: SK11-PAY-${String(input.payroll.id).slice(-8).toUpperCase()}`, margin, y); y += 13;
    doc.text(`Period: ${shortDate(input.payroll.periodStart)} ~ ${shortDate(input.payroll.periodEnd)}`, margin, y); y += 13;
    doc.text(`Payroll Date: ${shortDate(input.payroll.payrollDate)}`, margin, y); y += 13;
    doc.text(`Name: ${snap.legalNameEn || 'User-' + String(input.payroll.id).slice(-6)}`, margin, y); y += 13;
    doc.text(`HKID/Passport: ${snap.hkidMasked || snap.passportNoMasked || '—'}`, margin, y); y += 13;
    doc.text(`Department: ${snap.department || '—'}     Job Title: ${snap.jobTitle || '—'}`, margin, y); y += 13;
    y += 6;
    const body = input.items.map((it) => [it.itemName || it.itemCode, it.itemCode || '', formatHkd(it.amountHkd)]);
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Code', 'Amount (HKD)']],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, font: 'helvetica', fontStyle: 'normal' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      foot: [['', 'Net Payable', formatHkd(input.payroll.netPayableHkd)]],
      footStyles: { fillColor: [254, 243, 199], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' as const } },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 20;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(`Say: ${numberToEnglishWords(input.payroll.netPayableHkd)}`, margin, y);
    y += 18;
    if (errorMsg) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(180, 20, 20);
      doc.text(`Note: Generated with fallback layout (${errorMsg.slice(0, 120)})`, margin, y, { maxWidth: pageW - margin * 2 });
      doc.setTextColor(0);
      y += 14;
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    doc.text(
      `Generated: ${new Date(input.payroll.pdfGeneratedAt || Date.now()).toLocaleString('en-HK')}  Payslip: SK11-PAY-${String(input.payroll.id).slice(-8).toUpperCase()}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 30,
      { align: 'center' },
    );
    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
  } catch (e2) {
    // Last-resort: absolute minimal single-page doc
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('PAYSLIP', 300, 120, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Net Payable: ${formatHkd(input.payroll.netPayableHkd)}`, 300, 180, { align: 'center' });
    doc.text(`Period: ${shortDate(input.payroll.periodStart)} ~ ${shortDate(input.payroll.periodEnd)}`, 300, 210, { align: 'center' });
    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
  }
}

export function generatePayslipPdf(input: GeneratePayslipPdfInput, fontPack?: FontPack | null, locale: PdfLocale = 'bilingual'): Uint8Array {
  const L = (k: L): string => label(k, locale);
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    let fontsLoaded: { regular: Uint8Array; bold: Uint8Array; regularFamily: string; boldFamily: string } | null = null;
    if (locale !== 'en') {
      if (fontPack && fontPack.cjkAvailable && fontPack.regular) {
        fontsLoaded = {
          regular: fontPack.regular,
          bold: fontPack.bold || fontPack.regular,
          regularFamily: fontPack.regularFamily,
          boldFamily: fontPack.boldFamily,
        };
      } else {
        try {
          fontsLoaded = loadChineseFonts();
        } catch (e) {
          console.warn('[pdf.generatePayslipPdf] Inline CJK font load skipped:', String(e));
          fontsLoaded = null;
        }
      }
    }
    let FONT_REG = 'helvetica';
    let FONT_BOLD = 'helvetica';
    let useCjkFallback = !fontsLoaded && locale !== 'en';
    if (fontsLoaded) {
      try {
        FONT_REG = fontsLoaded.regularFamily;
        FONT_BOLD = fontsLoaded.boldFamily;
        doc.addFileToVFS(`${FONT_REG}.ttf`, _toBinaryStr(fontsLoaded.regular));
        doc.addFont(`${FONT_REG}.ttf`, FONT_REG, 'normal');
        if (fontsLoaded.boldFamily !== fontsLoaded.regularFamily) {
          doc.addFileToVFS(`${FONT_BOLD}.ttf`, _toBinaryStr(fontsLoaded.bold));
          doc.addFont(`${FONT_BOLD}.ttf`, FONT_BOLD, 'bold');
        } else {
          doc.addFont(`${FONT_REG}.ttf`, FONT_BOLD, 'bold');
        }
      } catch (e) {
        useCjkFallback = true;
        FONT_REG = 'helvetica';
        FONT_BOLD = 'helvetica';
        console.error('[pdf.generatePayslipPdf] CJK font register failed (fallback helvetica):', String(e));
      }
    }
    const setBold = (bold: boolean) => doc.setFont(bold ? FONT_BOLD : FONT_REG, bold ? 'bold' : 'normal');
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let cursorY = margin;
  // --- Header (company) ---
  const companyZh = input.company.COMPANY_NAME_ZH || '';
  const companyEn = input.company.COMPANY_NAME_EN || 'SK11 Finance Limited';
  const companyAddr = input.company.COMPANY_ADDRESS || '';
  const companyPhone = input.company.COMPANY_PHONE || '';

  doc.setFontSize(16);
  setBold(true);
  if (locale === 'bilingual' && companyZh) {
    doc.text(companyZh, pageW / 2, cursorY, { align: 'center' });
    cursorY += 18;
  } else if (locale === 'zh') {
    doc.text(companyZh || companyEn, pageW / 2, cursorY, { align: 'center' });
    cursorY += 18;
  }
  doc.setFontSize(12);
  doc.text(companyEn, pageW / 2, cursorY, { align: 'center' });
  cursorY += 14;
  if (companyAddr) {
    doc.setFontSize(10);
    setBold(false);
    doc.text(companyAddr, pageW / 2, cursorY, { align: 'center' });
    cursorY += 12;
  }
  if (companyPhone) {
    doc.setFontSize(10);
    doc.text(`Tel: ${companyPhone}`, pageW / 2, cursorY, { align: 'center' });
    cursorY += 12;
  }
  cursorY += 4;
  doc.setDrawColor(150);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 16;

  const payslipTitle = L(T.payslipTitle);
  const parts = payslipTitle.split('\n');
  for (let i = 0; i < parts.length; i++) {
    doc.setFontSize(i === 0 && parts.length > 1 ? 18 : (parts.length === 1 ? 18 : 14));
    setBold(true);
    doc.text(parts[i], pageW / 2, cursorY, { align: 'center' });
    cursorY += (parts.length > 1 && i === 0 ? 20 : 18);
  }
  cursorY += 4;

  // --- Meta info (payslip #, dates) ---
  setBold(false);
  doc.setFontSize(10);
  const currency = input.payroll.currency || 'HKD';
  const payslipNo = `SK11-PAY-${String(input.payroll.id).slice(-8).toUpperCase()}`;
  doc.text(`Payslip No.: ${payslipNo}`, margin, cursorY);
  doc.text(`Currency: ${currency}`, pageW - margin, cursorY, { align: 'right' });
  cursorY += 12;
  doc.text(`Period: ${shortDate(input.payroll.periodStart)} ~ ${shortDate(input.payroll.periodEnd)}`, margin, cursorY);
  doc.text(`Payroll Date: ${shortDate(input.payroll.payrollDate)}`, pageW - margin, cursorY, { align: 'right' });
  cursorY += 18;

  // --- Employee Info Block ---
  const p = input.profile;
  const col1X = margin;
  const col2X = margin + 230;
  const col3X = margin + 400;
  doc.setFontSize(10);
  setBold(true);
  doc.text(L(T.employeeBlock), margin, cursorY);
  cursorY += 14;
  setBold(false);

  const rowsInfo: [string, string, string, string][] = [
    [L(T.nameEn), p.legalNameEn, L(T.department), p.department || '—'],
    [L(T.nameZh), p.legalNameZh || '—', L(T.jobTitle), p.jobTitle || '—'],
    [L(T.hkid), (p.hkidMasked || p.passportNoMasked) ? `${p.hkidMasked || ''} ${p.passportNoMasked || ''}`.trim() : '—',
     L(T.dateJoined), p.dateJoinedIso ? shortDate(p.dateJoinedIso) : '—'],
    [L(T.mpfNo), p.mpfAccountNoMasked || '—',
     L(T.bank), (p.bankName || '—') + (p.bankAccountNoLast4 ? ` (尾 4 碼 ${p.bankAccountNoLast4})` : '')],
    [L(T.contact), [p.contactPhone, p.contactEmail].filter(Boolean).join(' / ') || '—',
     L(T.dob), p.dateOfBirthIso ? shortDate(p.dateOfBirthIso) : '—'],
  ];
  for (const [k1, v1, k2, v2] of rowsInfo) {
    setBold(true);
    doc.text(k1, col1X, cursorY);
    setBold(false);
    doc.text(String(v1), col2X, cursorY);
    setBold(true);
    doc.text(k2, col3X, cursorY);
    setBold(false);
    doc.text(String(v2), col3X + 80, cursorY);
    cursorY += 14;
  }
  cursorY += 6;

  // --- Two-table layout: Earnings | Deductions ---
  const earnings = input.items.filter((it) => it.itemType === 'EARNING');
  const deductions = input.items.filter((it) => it.itemType === 'DEDUCTION');

  // Ensure at least 6 rows each for visual alignment
  const minRows = Math.max(6, earnings.length, deductions.length);
  const pad = <T extends PdfPayrollItemRow>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    while (copy.length < n) copy.push({ itemType: 'EARNING', itemCode: '', itemName: '', amountHkd: 0 } as T);
    return copy;
  };
  const earnPad = pad(earnings, minRows);
  const dedPad = pad(deductions, minRows);

  const leftBody: (string | number)[][] = earnPad.map((it) => [
    it.itemName,
    it.itemCode,
    it.amountHkd ? formatHkd(it.amountHkd) : '',
  ]);
  const rightBody: (string | number)[][] = dedPad.map((it) => [
    it.itemName,
    it.itemCode,
    it.amountHkd ? formatHkd(it.amountHkd) : '',
  ]);

  const totalEarning = earnings.reduce((s, it) => s + it.amountHkd, 0);
  const totalDeduct = deductions.reduce((s, it) => s + it.amountHkd, 0);

  const leftHead = [[L(T.incomeTableHead), L(T.code), L(T.amount)]];
  const rightHead = [[L(T.deductionTableHead), L(T.code), L(T.amount)]];

  const leftFoot = [['', L(T.grossTotal), formatHkd(totalEarning)]];
  const rightFoot = [['', L(T.deductionTotal), formatHkd(totalDeduct)]];

  // Left table
  const halfW = (pageW - margin * 2 - 16) / 2;
  const commonTableStyles = {
    font: FONT_REG as unknown as undefined,
    fontStyle: 'normal' as const,
    fontSize: 9,
    cellPadding: 3,
    overflow: 'linebreak' as const,
  };
  autoTable(doc, {
    startY: cursorY,
    head: leftHead,
    body: leftBody,
    foot: leftFoot,
    margin: { left: margin, right: pageW - margin - halfW },
    styles: { ...commonTableStyles },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    footStyles: { fillColor: [226, 232, 240], fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    columnStyles: { 0: { cellWidth: halfW * 0.5 }, 1: { cellWidth: halfW * 0.2 }, 2: { halign: 'right' as const, cellWidth: halfW * 0.3 } },
    tableWidth: halfW,
    showFoot: 'lastPage',
  });
  const leftFinalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY;

  // Right table aligned
  autoTable(doc, {
    startY: cursorY,
    head: rightHead,
    body: rightBody,
    foot: rightFoot,
    margin: { left: margin + halfW + 16, right: margin },
    styles: { ...commonTableStyles },
    headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    footStyles: { fillColor: [254, 226, 226], fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    columnStyles: { 0: { cellWidth: halfW * 0.5 }, 1: { cellWidth: halfW * 0.2 }, 2: { halign: 'right' as const, cellWidth: halfW * 0.3 } },
    tableWidth: halfW,
    showFoot: 'lastPage',
  });
  const rightFinalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY;

  cursorY = Math.max(leftFinalY, rightFinalY) + 20;

  // --- Totals Banner ---
  doc.setFillColor(254, 243, 199);
  doc.rect(margin, cursorY, pageW - margin * 2, 40, 'F');
  setBold(true);
  doc.setFontSize(12);
  doc.text(`${L(T.netPayable)}:`, margin + 14, cursorY + 25);
  doc.setFontSize(18);
  doc.text(formatHkd(input.payroll.netPayableHkd), pageW - margin - 14, cursorY + 27, { align: 'right' });
  cursorY += 54;

  doc.setFontSize(10);
  setBold(false);
  const wording = numberToEnglishWords(input.payroll.netPayableHkd);
  doc.text(`Say: ${wording}`, margin, cursorY, { maxWidth: pageW - margin * 2 });
  cursorY += 18;

  // --- Admin note (optional) ---
  if (input.payroll.adminNote) {
    setBold(false);
    doc.setFontSize(9);
    doc.text(`${L(T.note)}: ${input.payroll.adminNote}`, margin, cursorY, { maxWidth: pageW - margin * 2 });
    cursorY += 14;
  }
  cursorY += 8;

  // --- Electronic Signatures ---
  doc.setFontSize(10);
  setBold(true);
  const signY = cursorY;
  doc.text(`${L(T.issuedBy)}:`, margin, signY);
  doc.text(`${L(T.acknowledgedBy)}:`, margin + 270, signY);
  doc.text(`${L(T.paid)}:`, pageW - margin, signY, { align: 'right' });
  cursorY += 18;
  setBold(false);
  const issuer = input.submittedBy
    ? ((input.submittedBy.legalNameZh ? `${input.submittedBy.legalNameZh} (${input.submittedBy.legalNameEn || ''})` : input.submittedBy.legalNameEn) || '—')
    : '—';
  doc.text(issuer, margin, cursorY);
  doc.text(
    input.payroll.confirmedAt
      ? `${L(T.confirmed)} (${shortDate(input.payroll.confirmedAt)})`
      : '—',
    margin + 270,
    cursorY,
  );
  doc.text(
    input.payroll.paidAt ? `${L(T.paid)} (${shortDate(input.payroll.paidAt)})` : L(T.notYetPaid),
    pageW - margin,
    cursorY,
    { align: 'right' },
  );
  cursorY += 24;

  // --- Footer ---
  doc.setFontSize(8);
  setBold(false);
  doc.setTextColor(100);
  doc.text(
    `${L(T.footerNote)} Generated: ${new Date(input.payroll.pdfGeneratedAt || Date.now()).toLocaleString('en-HK')}. Payslip: ${payslipNo}.`,
    pageW / 2,
    doc.internal.pageSize.getHeight() - 30,
    { align: 'center' },
  );
  doc.setTextColor(0);

    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
  } catch (err) {
    console.error('[pdf.generatePayslipPdf] main pipeline failed; using fallback:', String(err));
    return generateFallbackEnPdf(input, String(err), locale === 'en' ? 'en' : 'bilingual');
  }
}
