'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Download,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  listMyPayrolls,
  confirmPayroll,
  rejectPayroll,
  downloadPayrollPdf,
  type PayrollStatus,
} from '@/app/actions/payroll';
import { createTranslator, normalizeLocale, type Locale } from '@/lib/i18n';

type PdfLocale = 'bilingual' | 'zh' | 'en';
function getBrowserLocaleFromCookieOrFallback(): Locale {
  if (typeof document === 'undefined') return 'zh-HK';
  const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  return normalizeLocale(m?.[1]);
}

type Props = {
  userId: string;
  isAdmin: boolean;
  isSelf: boolean;
};

type PayrollItemRow = {
  id: string;
  itemType: string;
  itemCode: string;
  itemName: string;
  amountHkd: number;
  sourceText?: string | null;
};

type CycleRow = {
  id: string;
  cycleType: string;
  periodStart: string;
  periodEnd: string;
  payrollDate: string;
  status: string;
};

type PayrollRow = {
  id: string;
  salaryCycleId: string;
  userId: string;
  status: PayrollStatus;
  baseSalaryHkd: number;
  overtimeHkd: number;
  bonusHkd: number;
  commissionHkd: number;
  allowanceTotalHkd: number;
  deductionTotalHkd: number;
  grossTotalHkd: number;
  netPayableHkd: number;
  adminNote?: string | null;
  employeeNote?: string | null;
  paidReference?: string | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  paidAt?: string | null;
  cycle: CycleRow;
  items: PayrollItemRow[];
};

const fmtHkd = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' HKD';

function toIsoDay(s: unknown): string {
  if (s == null) return '—';
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const prim = String(s);
  try {
    const d = new Date(prim);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return prim.length >= 10 ? prim.slice(0, 10) : prim;
}
const shortDate = toIsoDay;

type TabKey = 'ALL' | 'PENDING' | 'CONFIRMED' | 'PAID';

export default function PayrollTab(props: Props) {
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('ALL');
  const [error, setError] = useState<string | null>(null);

  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<PayrollRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const [browserLocale, setBrowserLocale] = useState<Locale>(() => getBrowserLocaleFromCookieOrFallback());
  useEffect(() => {
    const id = setInterval(() => {
      const next = getBrowserLocaleFromCookieOrFallback();
      if (next !== browserLocale) setBrowserLocale(next);
    }, 800);
    return () => clearInterval(id);
  }, [browserLocale]);
  const t = useMemo(() => createTranslator(browserLocale), [browserLocale]);

  const statusChip = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      DRAFT: { label: t('statusDraft'), cls: 'bg-slate-100 text-slate-700 border border-slate-300' },
      SUBMITTED: { label: t('statusSubmitted'), cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
      CONFIRMED: { label: t('statusConfirmed'), cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
      PAID: { label: t('statusPaid'), cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
      REJECTED: { label: t('statusRejected'), cls: 'bg-rose-100 text-rose-800 border border-rose-300' },
    };
    const o = map[s] ?? { label: s, cls: 'bg-gray-100 text-gray-700 border border-gray-300' };
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${o.cls}`}>
        {o.label}
      </span>
    );
  };

  const cycleTypeLabel = (type: string) => {
    const m: Record<string, string> = {
      MONTHLY: t('cycleMonthlyShort'),
      SEMI_MONTHLY: t('cycleSemiMonthlyShort'),
      WEEKLY: t('cycleWeeklyShort'),
      BI_WEEKLY: t('cycleBiWeeklyShort'),
      ONE_OFF: t('cycleOneOffShort'),
    };
    return m[type] ?? type;
  };

  const TAB_DEFS = useMemo<{ key: TabKey; label: string; filter?: (p: PayrollRow) => boolean }[]>(() => [
    { key: 'ALL', label: t('tabAll') },
    { key: 'PENDING', label: t('tabPending'), filter: (p) => p.status === 'SUBMITTED' },
    { key: 'CONFIRMED', label: t('tabConfirmed'), filter: (p) => p.status === 'CONFIRMED' },
    { key: 'PAID', label: t('tabPaid'), filter: (p) => p.status === 'PAID' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [browserLocale]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = (await listMyPayrolls(props.userId)) as unknown as PayrollRow[];
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [props.userId]);

  const filtered = useMemo(() => {
    const def = TAB_DEFS.find((td) => td.key === tab);
    return def?.filter ? rows.filter(def.filter) : rows;
  }, [rows, tab, TAB_DEFS]);

  const stats = useMemo(() => {
    const s = { count: 0, netTotal: 0, grossTotal: 0, paidCount: 0, pendingCount: 0 };
    filtered.forEach((p) => {
      s.count += 1;
      s.grossTotal += p.grossTotalHkd || 0;
      s.netTotal += p.netPayableHkd || 0;
      if (p.status === 'PAID') s.paidCount += 1;
      if (p.status === 'SUBMITTED') s.pendingCount += 1;
    });
    return s;
  }, [filtered]);

  const handleConfirm = async (p: PayrollRow) => {
    setConfirmBusy(p.id);
    try {
      await confirmPayroll(p.id);
      await load(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmBusy(null);
    }
  };

  const openReject = (p: PayrollRow) => {
    setRejectOpen(p);
    setRejectReason('');
  };

  const handleRejectSubmit = async () => {
    if (!rejectOpen) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      alert(t('rejectValidation'));
      return;
    }
    setRejectBusy(true);
    try {
      await rejectPayroll(rejectOpen.id, rejectReason.trim());
      setRejectOpen(null);
      await load(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRejectBusy(false);
    }
  };

  const handleDownloadPdf = async (p: PayrollRow, locale: PdfLocale = 'bilingual') => {
    setPdfBusy(p.id);
    try {
      const res = await downloadPayrollPdf(p.id, locale);
      const blob = new Blob([res.bytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(null);
    }
  };

  const canAct = props.isSelf || props.isAdmin;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            {t('headerPayslips')}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t('headerRowCount').replace('{total}', String(rows.length)).replace('{shown}', String(filtered.length))}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('refreshBtnLabel')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">{t('loadFailTitle')}</div>
            <div className="text-rose-600 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1">
        {TAB_DEFS.map((td) => (
          <button
            key={td.key}
            onClick={() => setTab(td.key)}
            className={`px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
              tab === td.key
                ? 'bg-white border border-b-0 border-slate-200 text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {td.label}
            <span className="ml-1.5 text-xs text-slate-400">
              ({td.filter ? rows.filter(td.filter).length : rows.length})
            </span>
          </button>
        ))}
      </div>

      {/* Mini KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">{t('kpiRowsCount')}</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{stats.count}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">{t('kpiPendingTotal')}</div>
          <div className="text-xl font-bold text-amber-800 mt-1">{stats.pendingCount}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">{t('kpiGrossTotalMini')}</div>
          <div className="text-lg font-bold text-blue-800 mt-1 truncate">{fmtHkd(stats.grossTotal)}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">{t('kpiNetTotalMini')}</div>
          <div className="text-lg font-bold text-emerald-800 mt-1 truncate">{fmtHkd(stats.netTotal)}</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="h-5 w-24 bg-slate-200 rounded" />
                <div className="h-5 w-16 bg-slate-200 rounded ml-auto" />
              </div>
              <div className="h-16 bg-slate-100 rounded mt-4" />
              <div className="h-10 bg-slate-100 rounded mt-3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <div className="mt-2 text-slate-600 font-medium">{t('emptyPayslipTitle')}</div>
          <div className="text-xs text-slate-400 mt-1">
            {t('emptyPayslipHint')}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((p) => (
            <PayrollCard
              key={p.id}
              p={p}
              canAct={canAct}
              confirmBusy={confirmBusy === p.id}
              pdfBusy={pdfBusy === p.id}
              onConfirm={() => handleConfirm(p)}
              onReject={() => openReject(p)}
              onDownloadPdfLocale={(lc) => handleDownloadPdf(p, lc)}
              t={t}
              cycleTypeLabel={cycleTypeLabel}
            />
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-slate-900">{t('rejectModalTitle')}</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-600 rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="font-medium text-slate-700">
                  {t('rejectPayslipFormat')
                    .replace('{cycleType}', cycleTypeLabel(rejectOpen.cycle.cycleType))
                    .replace('{periodStart}', shortDate(rejectOpen.cycle.periodStart))
                    .replace('{periodEnd}', shortDate(rejectOpen.cycle.periodEnd))}
                </div>
                <div className="text-slate-500 mt-0.5 text-xs">
                  {t('rejectPayslipMeta')
                    .replace('{payrollDate}', shortDate(rejectOpen.cycle.payrollDate))
                    .replace('{net}', fmtHkd(rejectOpen.netPayableHkd))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('rejectFieldLabel')}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder={t('rejectPlaceholder')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setRejectOpen(null)}
                disabled={rejectBusy}
                className="px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {t('cancelBtn')}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={rejectBusy}
                className="px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {rejectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {t('rejectModalConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayrollCard(props: {
  p: PayrollRow;
  canAct: boolean;
  confirmBusy: boolean;
  pdfBusy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onDownloadPdfLocale: (locale: PdfLocale) => void;
  t: (k: any) => string;
  cycleTypeLabel: (type: string) => string;
}) {
  const { p, t } = props;
  const [expanded, setExpanded] = useState(false);
  const [pdfDropdownOpen, setPdfDropdownOpen] = useState(false);

  const showConfirmReject = p.status === 'SUBMITTED' && props.canAct;
  const showDownload = (p.status === 'CONFIRMED' || p.status === 'PAID') && props.canAct;
  const isPreviewable = (p.status === 'DRAFT' || p.status === 'REJECTED') && props.canAct;

  const earnings = p.items.filter((i) => i.itemType === 'EARNING');
  const deductions = p.items.filter((i) => i.itemType === 'DEDUCTION');

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Top */}
      <div className="px-4 md:px-5 py-4 border-b border-slate-100 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-slate-900">
              {t('cardTitleFormat').replace('{cycleType}', props.cycleTypeLabel(p.cycle.cycleType))}
            </h3>
            {/* Re-use status chip from parent; but we don't have access; recreate */}
            <StatusChipInline status={p.status} t={t} />
          </div>
          <div className="mt-1.5 text-xs md:text-sm text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="text-slate-400">{t('cycleColon')}</span>
              {shortDate(p.cycle.periodStart)} ~ {shortDate(p.cycle.periodEnd)}
            </span>
            <span>
              <span className="text-slate-400">{t('payrollDateLabel')}</span>
              {shortDate(p.cycle.payrollDate)}
            </span>
            {p.paidReference && (
              <span className="text-emerald-700">
                <span className="text-emerald-500">{t('refColon')}</span>
                {p.paidReference}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">{t('netPayableColon')}</div>
          <div className="text-xl md:text-2xl font-bold text-emerald-700 tabular-nums">
            {fmtHkd(p.netPayableHkd)}
          </div>
        </div>
      </div>

      {/* Amount grid */}
      <div className="px-4 md:px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <AmountItem label={t('amountLabelBase')} value={p.baseSalaryHkd} tone="slate" />
        <AmountItem label={t('amountLabelOvertime')} value={p.overtimeHkd} tone="indigo" />
        <AmountItem label={t('amountLabelBonus')} value={p.bonusHkd} tone="violet" />
        <AmountItem label={t('amountLabelCommission')} value={p.commissionHkd} tone="sky" />
        <AmountItem label={t('amountLabelAllowance')} value={p.allowanceTotalHkd} tone="teal" />
        <AmountItem label={t('amountLabelDeduction')} value={-p.deductionTotalHkd} tone="rose" />
        <AmountItem label={t('amountLabelGross')} value={p.grossTotalHkd} tone="blue" highlight />
        <AmountItem label={t('amountLabelNet')} value={p.netPayableHkd} tone="emerald" highlight />
      </div>

      {/* Notes / Rejected reason */}
      {p.status === 'REJECTED' && p.employeeNote && (
        <div className="mx-4 md:mx-5 mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm flex items-start gap-2">
          <XCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-rose-800">{t('rejectReasonChipLabel')}</div>
            <div className="text-rose-700 mt-0.5 whitespace-pre-wrap">{p.employeeNote}</div>
          </div>
        </div>
      )}
      {p.adminNote && (
        <div className="mx-4 md:mx-5 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-semibold text-slate-700 text-xs">{t('adminNoteMiniLabel')}</div>
          <div className="text-slate-600 mt-0.5 whitespace-pre-wrap">{p.adminNote}</div>
        </div>
      )}

      {/* Itemized expand */}
      <div className="px-4 md:px-5 pb-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs md:text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
        >
          {expanded ? t('collapseDetailsLabel') : t('expandDetailsLabel')}
          <span className="text-slate-400">{t('itemsCountLabel').replace('{count}', String(p.items.length))}</span>
        </button>
        {expanded && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {earnings.length > 0 && (
              <div className="rounded-lg border border-blue-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold">
                  {t('earningsTitleWithCount').replace('{count}', String(earnings.length))}
                </div>
                <div className="divide-y divide-slate-100">
                  {earnings.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 text-sm">
                          {it.itemName}
                          <span className="ml-1.5 text-xs text-slate-400">[{it.itemCode}]</span>
                        </div>
                        {it.sourceText && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {it.sourceText}
                          </div>
                        )}
                      </div>
                      <div className="font-semibold text-blue-700 tabular-nums whitespace-nowrap">
                        +{fmtHkd(it.amountHkd)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deductions.length > 0 && (
              <div className="rounded-lg border border-rose-200 overflow-hidden">
                <div className="bg-rose-600 text-white px-3 py-1.5 text-xs font-semibold">
                  {t('deductionsTitleWithCount').replace('{count}', String(deductions.length))}
                </div>
                <div className="divide-y divide-slate-100">
                  {deductions.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 text-sm">
                          {it.itemName}
                          <span className="ml-1.5 text-xs text-slate-400">[{it.itemCode}]</span>
                        </div>
                        {it.sourceText && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {it.sourceText}
                          </div>
                        )}
                      </div>
                      <div className="font-semibold text-rose-700 tabular-nums whitespace-nowrap">
                        −{fmtHkd(it.amountHkd)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 md:px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          {p.submittedAt && <span>{t('submittedAtMini')}{shortDate(p.submittedAt)}</span>}
          {p.confirmedAt && <span>{t('confirmedAtMini')}{shortDate(p.confirmedAt)}</span>}
          {p.paidAt && <span className="text-emerald-600">{t('paidAtMini')}{shortDate(p.paidAt)}</span>}
          {p.rejectedAt && <span className="text-rose-600">{t('rejectedAtMini')}{shortDate(p.rejectedAt)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPreviewable && (
            <button
              onClick={() => props.onDownloadPdfLocale('bilingual')}
              disabled={props.pdfBusy}
              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-100 disabled:opacity-50 inline-flex items-center gap-1.5"
              title="管理員可預覽草稿 PDF"
            >
              {props.pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('previewPdfBtn')}
            </button>
          )}
          {showDownload && (
            <div className="relative inline-block">
              <button
                onClick={() => setPdfDropdownOpen((o) => !o)}
                onBlur={() => setTimeout(() => setPdfDropdownOpen(false), 150)}
                disabled={props.pdfBusy}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {props.pdfBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {t('downloadPdfCardBtn')} ▾
              </button>
              {pdfDropdownOpen && (
                <div className="absolute z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg right-0">
                  {(['bilingual', 'zh', 'en'] as PdfLocale[]).map((lc) => (
                    <button
                      key={lc}
                      type="button"
                      className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-100"
                      onMouseDown={async (e) => {
                        e.preventDefault();
                        setPdfDropdownOpen(false);
                        props.onDownloadPdfLocale(lc);
                      }}
                    >
                      {lc === 'bilingual' ? t('downloadPdfBilingual') : lc === 'zh' ? t('downloadPdfZh') : t('downloadPdfEn')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {showConfirmReject && (
            <>
              <button
                onClick={props.onReject}
                className="px-3.5 py-2 rounded-md border border-rose-300 bg-white text-rose-700 text-sm font-medium hover:bg-rose-50 inline-flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                {t('rejectCardBtn')}
              </button>
              <button
                onClick={props.onConfirm}
                disabled={props.confirmBusy}
                className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {props.confirmBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {t('confirmCardBtn')}
              </button>
            </>
          )}
          {p.status === 'DRAFT' && !props.canAct === false && !isPreviewable && (
            <span className="text-xs text-slate-400 italic">{t('draftNotSubmitted')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChipInline({ status, t }: { status: string; t: (k: any) => string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: t('statusDraft'), cls: 'bg-slate-100 text-slate-700 border border-slate-300' },
    SUBMITTED: { label: t('statusSubmitted'), cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
    CONFIRMED: { label: t('statusConfirmed'), cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
    PAID: { label: t('statusPaid'), cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
    REJECTED: { label: t('statusRejected'), cls: 'bg-rose-100 text-rose-800 border border-rose-300' },
  };
  const o = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700 border border-gray-300' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${o.cls}`}>
      {o.label}
    </span>
  );
}

function AmountItem(props: {
  label: string;
  value: number;
  tone: 'slate' | 'indigo' | 'violet' | 'sky' | 'teal' | 'rose' | 'blue' | 'emerald';
  highlight?: boolean;
}) {
  const toneMap: Record<string, string> = {
    slate: 'text-slate-700',
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
    sky: 'text-sky-700',
    teal: 'text-teal-700',
    rose: 'text-rose-700',
    blue: 'text-blue-800',
    emerald: 'text-emerald-800',
  };
  const bgMap: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200',
    indigo: 'bg-indigo-50 border-indigo-100',
    violet: 'bg-violet-50 border-violet-100',
    sky: 'bg-sky-50 border-sky-100',
    teal: 'bg-teal-50 border-teal-100',
    rose: 'bg-rose-50 border-rose-100',
    blue: 'bg-blue-50 border-blue-200',
    emerald: 'bg-emerald-50 border-emerald-200',
  };
  const abs = Math.abs(props.value);
  const sign = props.value < 0 ? '−' : props.value > 0 ? '+' : '';
  return (
    <div
      className={`rounded-lg border ${bgMap[props.tone]} px-3 py-2 ${
        props.highlight ? 'shadow-sm' : ''
      }`}
    >
      <div className="text-[11px] text-slate-500 font-medium">{props.label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${toneMap[props.tone]}`}>
        {props.highlight || props.value < 0 ? sign : ''}
        {abs.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span className="text-[10px] ml-1 font-normal opacity-60">HKD</span>
      </div>
    </div>
  );
}
