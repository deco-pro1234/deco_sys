'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, PlusCircle, Search, Send, CheckCircle, XCircle, FileText, Loader2, RefreshCw } from 'lucide-react';
import {
  adminListPayrolls,
  batchCreatePayrolls,
  batchSubmitPayrolls,
  batchDownloadPdfZip,
  confirmPayroll,
  createSalaryCycle,
  deletePayroll,
  exportPayrollsCsv,
  markPayrollPaid,
  rejectPayroll,
  submitPayrollForConfirmation,
  withdrawPayroll,
  updatePayrollAmounts,
  updateSalaryCycle,
  downloadPayrollPdf,
  getMyProfile,
  adminUpdateUserProfile,
  type PayrollStatus,
} from '@/app/actions/payroll';
import type { PayrollAmountsInput, UserProfileSnapshotInput } from '@/lib/payroll/calc';
import { createTranslator, normalizeLocale, type Locale } from '@/lib/i18n';

type PdfLocale = 'bilingual' | 'zh' | 'en';
function getBrowserLocaleFromCookieOrFallback(): Locale {
  if (typeof document === 'undefined') return 'zh-HK';
  const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  return normalizeLocale(m?.[1]);
}

type SalaryCycleRow = {
  id: string;
  cycleType: string;
  periodStart: string;
  periodEnd: string;
  payrollDate: string;
  status: string;
  note?: string | null;
  headcountTotal: number;
  headcountConfirmed: number;
  headcountPaid: number;
  grossTotalHkd: number;
  deductionTotalHkd: number;
  netPayableTotalHkd: number;
  amountPaidTotalHkd: number;
};

type UserRow = {
  id: string;
  roleName: string;
  isAdmin: boolean;
  profile: null | { legalNameEn?: string; legalNameZh?: string; department?: string; jobTitle?: string };
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
  snapshotProfileJson: {
    legalNameEn: string;
    legalNameZh?: string | null;
    department?: string | null;
    jobTitle?: string | null;
  };
  cycle: {
    id: string;
    cycleType: string;
    periodStart: string;
    periodEnd: string;
    payrollDate: string;
    status: string;
  };
  items: {
    id: string;
    itemType: string;
    itemCode: string;
    itemName: string;
    amountHkd: number;
    sourceText?: string | null;
  }[];
};

const fmtHkd = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' HKD';

function toIsoDay(s: unknown): string {
  if (s == null) return '';
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const prim = String(s);
  try {
    const d = new Date(prim);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return prim.length >= 10 ? prim.slice(0, 10) : prim;
}
const shortDate = toIsoDay;

type Props = {
  initialCycles: SalaryCycleRow[];
  allUsers: UserRow[];
  departments: string[];
  jobTitles: string[];
  defaultPeriodStartGte: string;
};

export default function AdminPayrollClient(props: Props) {
  const [cycles, setCycles] = useState<SalaryCycleRow[]>(props.initialCycles);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(props.initialCycles[0]?.id);
  const [statusFilter, setStatusFilter] = useState<PayrollStatus[]>([]);
  const [deptFilter, setDeptFilter] = useState<string | undefined>();
  const [titleFilter, setTitleFilter] = useState<string | undefined>();
  const [periodGte, setPeriodGte] = useState<string>(props.defaultPeriodStartGte);
  const [periodLte, setPeriodLte] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [stats, setStats] = useState<{ count: number; grossTotalHkd: number; deductionTotalHkd: number; netTotalHkd: number; countConfirmed: number; countPaid: number; amountPaidHkd: number }>(
    { count: 0, grossTotalHkd: 0, deductionTotalHkd: 0, netTotalHkd: 0, countConfirmed: 0, countPaid: 0, amountPaidHkd: 0 },
  );
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cycle modal
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [newCycle, setNewCycle] = useState<{ cycleType: string; periodStart: string; periodEnd: string; payrollDate: string; note: string }>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return {
      cycleType: 'MONTHLY',
      periodStart: `${y}-${String(m).padStart(2, '0')}-01`,
      periodEnd: `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`,
      payrollDate: `${y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-05`,
      note: '',
    };
  });

  // Batch user modal
  const [showBatchAdd, setShowBatchAdd] = useState(false);
  const [batchUserIds, setBatchUserIds] = useState<Set<string>>(new Set());

  // Row action modal
  const [actionModal, setActionModal] = useState<null | { mode: 'edit' | 'markPaid' | 'viewReject' | 'profile'; payrollId: string; userId?: string }>(null);
  const [editForm, setEditForm] = useState<PayrollAmountsInput & { adminNote?: string | null }>({
    baseSalaryHkd: 0,
  });
  const [markPaidForm, setMarkPaidForm] = useState<{ paidAt: string; paidReference: string }>(
    { paidAt: new Date().toISOString().slice(0, 10), paidReference: '' },
  );
  type FullProfileForm = UserProfileSnapshotInput & { emergencyName?: string | null; emergencyPhone?: string | null };
  const [profileForm, setProfileForm] = useState<FullProfileForm>({ legalNameEn: '', defaultBaseSalaryHkd: 0 });
  const [profileLoading, setProfileLoading] = useState(false);

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
      OPEN: { label: t('cycleStatusOpen'), cls: 'bg-sky-50 text-sky-700 border border-sky-200' },
      LOCKED: { label: t('cycleStatusLocked'), cls: 'bg-slate-200 text-slate-700 border border-slate-400' },
      SETTLED: { label: t('cycleStatusSettled'), cls: 'bg-violet-100 text-violet-800 border border-violet-300' },
    };
    const o = map[s] ?? { label: s, cls: 'bg-gray-100 text-gray-700 border border-gray-300' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${o.cls}`}>{o.label}</span>
    );
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const result = await adminListPayrolls({
        salaryCycleId: selectedCycleId,
        status: statusFilter.length ? statusFilter : undefined,
        department: deptFilter,
        jobTitle: titleFilter,
        periodStartGte: periodGte || undefined,
        periodEndLte: periodLte || undefined,
        searchKeyword: keyword || undefined,
      });
      setRows(result.rows as unknown as PayrollRow[]);
      setStats(result.stats);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycleId, statusFilter, deptFilter, titleFilter, periodGte, periodLte]);

  const userDisplayName = (u: UserRow) => {
    const zh = u.profile?.legalNameZh;
    const en = u.profile?.legalNameEn || u.roleName || String(u.id).slice(-6);
    return zh ? `${zh} (${en})` : en;
  };

  const toggleStatus = (s: PayrollStatus) => {
    setStatusFilter((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  };

  const cyclesForLabel = useMemo(() => cycles.map((c) => ({
    id: c.id,
    label: `${shortDate(c.periodStart)}~${shortDate(c.periodEnd)}  [${c.cycleType}]  (${c.status})`,
  })), [cycles]);

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((cur) => {
      if (cur.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const handleCreateCycle = async () => {
    const arg: any = newCycle;
    await createSalaryCycle(arg);
    setShowNewCycle(false);
    window.location.reload();
  };

  const handleBatchCreate = async () => {
    if (!selectedCycleId || batchUserIds.size === 0) return;
    await batchCreatePayrolls(selectedCycleId, Array.from(batchUserIds));
    setShowBatchAdd(false);
    setBatchUserIds(new Set());
    await loadRows();
  };

  const handleBatchSubmit = async () => {
    if (selectedIds.size === 0) return;
    await batchSubmitPayrolls(Array.from(selectedIds));
    await loadRows();
  };

  const handleBatchZip = async (locale: PdfLocale = 'bilingual') => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : rows.map((r) => r.id);
    const res = await batchDownloadPdfZip(ids, locale);
    downloadBlob(new Blob([res.bytes as any], { type: 'application/zip' }), res.filename);
  };

  const handleCsv = async () => {
    const res = await exportPayrollsCsv({
      salaryCycleId: selectedCycleId,
      status: statusFilter.length ? statusFilter : undefined,
      department: deptFilter,
      jobTitle: titleFilter,
      periodStartGte: periodGte || undefined,
      periodEndLte: periodLte || undefined,
      searchKeyword: keyword || undefined,
    });
    const bufCsv = new Uint8Array(res.bytes.length);
    bufCsv.set(res.bytes as unknown as Uint8Array<ArrayBuffer>);
    downloadBlob(new Blob([bufCsv], { type: 'text/csv;charset=utf-8' }), res.filename);
  };

  const openEdit = (row: PayrollRow) => {
    const allowanceItems = row.items.filter((it) => it.itemType === 'EARNING' && !['BASE_SALARY','OVERTIME','BONUS_ANNUAL','COMMISSION'].includes(it.itemCode));
    const deductionItems = row.items.filter((it) => it.itemType === 'DEDUCTION');
    setEditForm({
      baseSalaryHkd: row.baseSalaryHkd,
      overtimeHkd: row.overtimeHkd,
      bonusHkd: row.bonusHkd,
      commissionHkd: row.commissionHkd,
      allowanceItems: allowanceItems.map((it) => ({
        itemType: 'EARNING', itemCode: it.itemCode, itemName: it.itemName, sourceText: it.sourceText, amountHkd: it.amountHkd,
      })),
      deductionItems: deductionItems.map((it) => ({
        itemType: 'DEDUCTION', itemCode: it.itemCode, itemName: it.itemName, sourceText: it.sourceText, amountHkd: it.amountHkd,
      })),
      adminNote: row.adminNote ?? null,
    });
    setActionModal({ mode: 'edit', payrollId: row.id });
  };

  const handleEditSave = async () => {
    if (!actionModal || actionModal.mode !== 'edit') return;
    await updatePayrollAmounts(actionModal.payrollId, editForm);
    setActionModal(null);
    await loadRows();
  };

  const handleMarkPaid = async () => {
    if (!actionModal || actionModal.mode !== 'markPaid') return;
    await markPayrollPaid(actionModal.payrollId, {
      paidAt: markPaidForm.paidAt || undefined,
      paidReference: markPaidForm.paidReference || undefined,
    });
    setActionModal(null);
    await loadRows();
  };

  const openProfileModal = async (row: PayrollRow) => {
    setProfileLoading(true);
    try {
      const r = (await getMyProfile(row.userId)) as any;
      setProfileForm({
        legalNameEn: r?.legalNameEn ?? '',
        legalNameZh: r?.legalNameZh ?? null,
        hkid: r?.hkid ?? null,
        passportNo: r?.passportNo ?? null,
        dateOfBirth: r?.dateOfBirth ? toIsoDay(r.dateOfBirth) : null,
        jobTitle: r?.jobTitle ?? null,
        department: r?.department ?? null,
        dateJoined: r?.dateJoined ? toIsoDay(r.dateJoined) : null,
        defaultBaseSalaryHkd: r?.defaultBaseSalaryHkd ?? 0,
        bankName: r?.bankName ?? null,
        bankAccountNo: r?.bankAccountNo ?? null,
        mpfAccountNo: r?.mpfAccountNo ?? null,
        addressLine1: r?.addressLine1 ?? null,
        addressLine2: r?.addressLine2 ?? null,
        contactPhone: r?.contactPhone ?? null,
        contactEmail: r?.contactEmail ?? null,
        emergencyName: r?.emergencyName ?? null,
        emergencyPhone: r?.emergencyPhone ?? null,
      });
      setActionModal({ mode: 'profile', payrollId: row.id, userId: row.userId });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!actionModal || actionModal.mode !== 'profile' || !actionModal.userId) return;
    if (!profileForm.legalNameEn.trim()) {
      alert('legalNameEn 為必填');
      return;
    }
    try {
      setProfileLoading(true);
      await adminUpdateUserProfile(actionModal.userId, profileForm);
      alert(t('savedSuccess'));
      setActionModal(null);
      await loadRows();
    } catch (e) {
      alert(String(e));
    } finally {
      setProfileLoading(false);
    }
  };

  const handleDownloadPdf = async (id: string, locale: PdfLocale = 'bilingual') => {
    const res = await downloadPayrollPdf(id, locale);
    downloadBlob(new Blob([res.bytes as any], { type: 'application/pdf' }), res.filename);
  };

  const PdfDropdown = ({ payrollId }: { payrollId: string }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative inline-block">
        <button
          onClick={() => setOpen((o) => !o)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          title={t('downloadPdf')}
          className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-white inline-flex items-center gap-1"
        >
          <FileText className="w-3 h-3" /> PDF ▾
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg right-0">
            {(['bilingual', 'zh', 'en'] as PdfLocale[]).map((lc) => (
              <button
                key={lc}
                type="button"
                className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-100"
                onMouseDown={async (e) => {
                  e.preventDefault();
                  setOpen(false);
                  await handleDownloadPdf(payrollId, lc);
                }}
              >
                {lc === 'bilingual' ? t('downloadPdfBilingual') : lc === 'zh' ? t('downloadPdfZh') : t('downloadPdfEn')}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ZipDropdown = () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative inline-block">
        <button
          onClick={() => setOpen((o) => !o)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          title={t('zipBtnTitle')}
          className="inline-flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded"
        >
          <Download className="w-3 h-3" /> {t('batchZipBtn')} ▾
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg right-0">
            {(['bilingual', 'zh', 'en'] as PdfLocale[]).map((lc) => (
              <button
                key={lc}
                type="button"
                className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-100"
                onMouseDown={async (e) => {
                  e.preventDefault();
                  setOpen(false);
                  await handleBatchZip(lc);
                }}
              >
                {lc === 'bilingual' ? t('zipLocaleBilingual') : lc === 'zh' ? t('zipLocaleZh') : t('zipLocaleEn')}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('payrollPage')}</h1>
          <p className="text-slate-500 mt-1 text-sm">{t('payrollPageHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowNewCycle(true)} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md px-3 py-2 text-sm font-medium">
            <PlusCircle className="w-4 h-4" /> {t('createSalaryCycle')}
          </button>
          <button onClick={() => setShowBatchAdd(true)} disabled={!selectedCycleId} className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-40">
            <PlusCircle className="w-4 h-4" /> {t('batchAddUsers')}
          </button>
          <button onClick={loadRows} className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md px-3 py-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('refreshBtnLabel')}
          </button>
        </div>
      </div>

      {/* Filters Block A */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 font-medium mb-3">
          <Filter className="w-4 h-4" /> {t('filtersLabel')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterCycle')}</label>
            <select value={selectedCycleId ?? ''} onChange={(e) => setSelectedCycleId(e.target.value || undefined)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">{t('filterCycleAll')}</option>
              {cyclesForLabel.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterDept')}</label>
            <select value={deptFilter ?? ''} onChange={(e) => setDeptFilter(e.target.value || undefined)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">{t('filterDeptAll')}</option>
              {props.departments.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterJob')}</label>
            <select value={titleFilter ?? ''} onChange={(e) => setTitleFilter(e.target.value || undefined)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">{t('filterJobAll')}</option>
              {props.jobTitles.map((j) => (<option key={j} value={j}>{j}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterPeriodGte')}</label>
            <input type="date" value={periodGte} onChange={(e) => setPeriodGte(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"/>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterPeriodLte')}</label>
            <input type="date" value={periodLte} onChange={(e) => setPeriodLte(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"/>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('filterKeyword')}</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('filterKeywordPlaceholder')} className="w-full border border-slate-300 rounded pl-7 pr-2 py-1.5 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-slate-500">{t('statusColon')}</span>
          {(['DRAFT','SUBMITTED','CONFIRMED','PAID','REJECTED'] as PayrollStatus[]).map((s) => {
            const active = statusFilter.includes(s);
            return (
              <button key={s} onClick={() => toggleStatus(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                {statusChip(s)}
              </button>
            );
          })}
          <div className="ml-auto">
            <button onClick={loadRows} className="text-xs px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-1.5">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} {t('searchBtn')}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Block B */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
        <KpiCard label={t('kpiPayrollCount')} value={`${stats.count}`} sub={t('kpiPayrollCountSub')} tone="slate" />
        <KpiCard label={t('kpiConfirmed')} value={`${stats.countConfirmed}/${stats.count}`} sub={`${stats.count ? Math.round(stats.countConfirmed*100/stats.count) : 0}%`} tone="blue" />
        <KpiCard label={t('kpiPaid')} value={`${stats.countPaid}/${stats.count}`} sub={`${stats.count ? Math.round(stats.countPaid*100/stats.count) : 0}%`} tone="emerald" />
        <KpiCard label={t('kpiGrossTotal')} value={fmtHkd(stats.grossTotalHkd)} sub={t('kpiGrossTotalSub')} tone="slate" />
        <KpiCard label={t('kpiDeductionTotal')} value={fmtHkd(stats.deductionTotalHkd)} sub={t('kpiDeductionTotalSub')} tone="rose" />
        <KpiCard label={t('kpiNetPayable')} value={fmtHkd(stats.netTotalHkd)} sub={t('kpiNetPayableSub')} tone="indigo" />
        <KpiCard label={t('kpiAmountPaid')} value={fmtHkd(stats.amountPaidHkd)} sub={`${stats.netTotalHkd ? Math.round(stats.amountPaidHkd*100/stats.netTotalHkd) : 0}%`} tone="emerald" />
      </div>

      {/* Salary cycle summary cards */}
      {cycles.length > 0 && selectedCycleId && (
        <div className="mb-5 bg-slate-50 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-slate-700">
              {t('cycleSummaryTitle')}{cyclesForLabel.find((c) => c.id === selectedCycleId)?.label}
            </div>
            <div className="flex gap-2">
              {(() => {
                const c = cycles.find((x) => x.id === selectedCycleId);
                if (!c) return null;
                return (
                  <>
                    {c.status === 'OPEN' ? (
                      <button onClick={async () => { await updateSalaryCycle(c.id, { status: 'LOCKED' }); window.location.reload(); }} className="text-xs px-2.5 py-1 border border-slate-400 text-slate-700 rounded hover:bg-white">{t('cycleLockBtn')}</button>
                    ) : c.status === 'LOCKED' ? (
                      <button onClick={async () => { await updateSalaryCycle(c.id, { status: 'SETTLED' }); window.location.reload(); }} className="text-xs px-2.5 py-1 border border-violet-300 text-violet-700 rounded hover:bg-white">{t('cycleSettleBtn')}</button>
                    ) : (
                      <span className="text-xs text-slate-500">{t('cycleSettledChip')}</span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          {(() => {
            const c = cycles.find((x) => x.id === selectedCycleId);
            if (!c) return null;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-600">
                <div><span className="text-slate-400">{t('cycleHcLabel')}</span> <b>{c.headcountTotal} / {c.headcountConfirmed} / {c.headcountPaid}</b></div>
                <div><span className="text-slate-400">{t('cycleGdLabel')}</span> <b>{fmtHkd(c.grossTotalHkd)} / {fmtHkd(c.deductionTotalHkd)}</b></div>
                <div><span className="text-slate-400">{t('cycleNpLabel')}</span> <b>{fmtHkd(c.netPayableTotalHkd)} / {fmtHkd(c.amountPaidTotalHkd)}</b></div>
                <div><span className="text-slate-400">{t('cycleNoteLabel')}</span> <b>{c.note || '—'}</b></div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Table Block C */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleSelectAll} />
            {t('selectAllLabel')}
            {selectedIds.size > 0 && <span className="text-slate-500">{t('selectedCountLabel').replace('{count}', String(selectedIds.size))}</span>}
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={handleBatchSubmit} disabled={selectedIds.size === 0} className="inline-flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-2.5 py-1.5 rounded">
              <Send className="w-3 h-3" /> {t('batchSubmitBtn')}
            </button>
            <ZipDropdown />
            <button onClick={handleCsv} className="inline-flex items-center gap-1.5 text-xs bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded">
              <FileText className="w-3 h-3" /> {t('batchCsvBtn')}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="w-10"></th>
                <th className="text-left px-3 py-2 font-medium">{t('thUser')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('thCycle')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('thStatus')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('thBase')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('thAddon')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('thDeduction')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('thNet')}</th>
                <th className="text-center px-3 py-2 font-medium">{t('thAction')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-400 text-sm">
                    {loading ? t('loadingRows') : t('noDataHint')}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const snap = r.snapshotProfileJson;
                const who = [snap.legalNameZh, snap.legalNameEn].filter(Boolean).join(' / ');
                const addons = r.overtimeHkd + r.bonusHkd + r.commissionHkd + r.allowanceTotalHkd;
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="pl-3 pr-1">
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{who}</div>
                      <div className="text-xs text-slate-500">
                        {[snap.department, snap.jobTitle].filter(Boolean).join(' · ') || t('noProfileHint')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div>{shortDate(r.cycle.periodStart)} ~ {shortDate(r.cycle.periodEnd)}</div>
                      <div className="text-slate-400">{t('payrollDateLabel')} {shortDate(r.cycle.payrollDate)}</div>
                    </td>
                    <td className="px-3 py-2">{statusChip(r.status)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHkd(r.baseSalaryHkd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">+{fmtHkd(addons)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700">-{fmtHkd(r.deductionTotalHkd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{fmtHkd(r.netPayableHkd)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          title={t('profileBtnTitle')}
                          onClick={() => openProfileModal(r)}
                          className="text-xs px-2 py-1 border border-indigo-300 bg-indigo-50 text-indigo-800 rounded hover:bg-indigo-100"
                        >
                          {t('profileBtnLabel')}
                        </button>
                        {(r.status === 'DRAFT' || r.status === 'REJECTED') && (
                          <>
                            <button title="編輯" onClick={() => openEdit(r)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-white">{t('editBtnLabel')}</button>
                            <button title="送出確認" onClick={async () => { await submitPayrollForConfirmation(r.id); await loadRows(); }} className="text-xs px-2 py-1 border border-amber-300 bg-amber-50 text-amber-800 rounded hover:bg-amber-100">{t('submitBtnLabel')}</button>
                            <button title="刪除" onClick={async () => { if (!confirm(t('deleteBtnConfirm'))) return; await deletePayroll(r.id); await loadRows(); }} className="text-xs px-2 py-1 border border-rose-200 text-rose-700 rounded hover:bg-rose-50">🗑️</button>
                          </>
                        )}
                        {r.status === 'SUBMITTED' && (
                          <>
                            <button title="撤回" onClick={async () => { await withdrawPayroll(r.id); await loadRows(); }} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-white">{t('withdrawBtnLabel')}</button>
                            <button title="模擬確認(admin測試)" onClick={async () => { await confirmPayroll(r.id, '管理員快速確認'); await loadRows(); }} className="text-xs px-2 py-1 border border-blue-300 bg-blue-50 text-blue-800 rounded hover:bg-blue-100">{t('quickConfirmBtnLabel')}</button>
                            <button title="模擬拒絕(admin測試)" onClick={async () => { await rejectPayroll(r.id, '管理員測試拒絕'); await loadRows(); }} className="text-xs px-2 py-1 border border-rose-200 text-rose-700 rounded hover:bg-rose-50">{t('quickRejectBtnLabel')}</button>
                          </>
                        )}
                        {r.status === 'CONFIRMED' && (
                          <button title="標註已發薪" onClick={() => setActionModal({ mode: 'markPaid', payrollId: r.id })} className="text-xs px-2 py-1 border border-emerald-300 bg-emerald-50 text-emerald-800 rounded hover:bg-emerald-100">{t('markPaidBtnLabel')}</button>
                        )}
                        {(r.status !== 'DRAFT' && r.status !== 'REJECTED') && (
                          <PdfDropdown payrollId={r.id} />
                        )}
                        {r.status === 'PAID' && r.paidReference && (
                          <span className="text-[11px] text-slate-500">{t('refLabelPrefix')}<b className="tabular-nums">{r.paidReference}</b></span>
                        )}
                        {r.status === 'REJECTED' && r.employeeNote && (
                          <span title={r.employeeNote} className="inline-flex items-center text-[11px] text-rose-600"><XCircle className="w-3 h-3 mr-1" /> {t('rejectReasonChipLabel')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cycle modal */}
      {showNewCycle && (
        <Modal title={t('cycleModalTitle')} onClose={() => setShowNewCycle(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-slate-500">{t('cycleTypeLabel')}</label>
              <select className="w-full border border-slate-300 rounded px-2 py-1.5" value={newCycle.cycleType} onChange={(e) => setNewCycle({ ...newCycle, cycleType: e.target.value })}>
                <option value="MONTHLY">{t('cycleTypeMonthly')}</option>
                <option value="SEMI_MONTHLY">{t('cycleTypeSemiMonthly')}</option>
                <option value="WEEKLY">{t('cycleTypeWeekly')}</option>
                <option value="BI_WEEKLY">{t('cycleTypeBiWeekly')}</option>
                <option value="ONE_OFF">{t('cycleTypeOneOff')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('periodStartLabel')}</label>
              <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5" value={newCycle.periodStart} onChange={(e) => setNewCycle({ ...newCycle, periodStart: e.target.value })}/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('periodEndLabel')}</label>
              <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5" value={newCycle.periodEnd} onChange={(e) => setNewCycle({ ...newCycle, periodEnd: e.target.value })}/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('payrollDateLabelNew')}</label>
              <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5" value={newCycle.payrollDate} onChange={(e) => setNewCycle({ ...newCycle, payrollDate: e.target.value })}/>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-500">{t('adminNoteCycleLabel')}</label>
              <input className="w-full border border-slate-300 rounded px-2 py-1.5" value={newCycle.note} onChange={(e) => setNewCycle({ ...newCycle, note: e.target.value })}/>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setShowNewCycle(false)} className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">{t('cancelBtn')}</button>
            <button onClick={handleCreateCycle} className="text-sm px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800">{t('createBtn')}</button>
          </div>
        </Modal>
      )}

      {/* Batch add users */}
      {showBatchAdd && (
        <Modal title={t('batchModalTitle').replace('{count}', String(batchUserIds.size))} onClose={() => setShowBatchAdd(false)}>
          <p className="text-xs text-slate-500 mb-2">
            {t('batchModalHint')}
          </p>
          <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
            {props.allUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={batchUserIds.has(u.id)} onChange={() => {
                  const next = new Set(batchUserIds);
                  next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                  setBatchUserIds(next);
                }} />
                <div>
                  <div className="text-sm text-slate-800 font-medium">{userDisplayName(u)}</div>
                  <div className="text-xs text-slate-500">
                    {[u.profile?.department, u.profile?.jobTitle, u.isAdmin ? 'admin' : u.roleName || 'MEMBER'].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowBatchAdd(false)} className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">{t('cancelBtn')}</button>
            <button onClick={handleBatchCreate} disabled={batchUserIds.size === 0} className="text-sm px-3 py-1.5 rounded bg-slate-900 disabled:opacity-40 text-white hover:bg-slate-800">{t('batchModalCreateBtn').replace('{count}', String(batchUserIds.size))}</button>
          </div>
        </Modal>
      )}

      {/* Edit / MarkPaid modals */}
      {actionModal?.mode === 'edit' && (
        <Modal title={t('editModalTitle')} onClose={() => setActionModal(null)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <NumberField label={t('nfBaseSalary')} value={editForm.baseSalaryHkd} onChange={(v) => setEditForm({ ...editForm, baseSalaryHkd: v })}/>
            <NumberField label={t('nfOvertime')} value={editForm.overtimeHkd ?? 0} onChange={(v) => setEditForm({ ...editForm, overtimeHkd: v })}/>
            <NumberField label={t('nfBonus')} value={editForm.bonusHkd ?? 0} onChange={(v) => setEditForm({ ...editForm, bonusHkd: v })}/>
            <NumberField label={t('nfCommission')} value={editForm.commissionHkd ?? 0} onChange={(v) => setEditForm({ ...editForm, commissionHkd: v })}/>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('editAdminNoteLabel')}</label>
            <textarea className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" rows={2} value={editForm.adminNote ?? ''} onChange={(e) => setEditForm({ ...editForm, adminNote: e.target.value })}/>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {t('editHeadroomHint')}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setActionModal(null)} className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">{t('cancelBtn')}</button>
            <button onClick={handleEditSave} className="text-sm px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> {t('editSaveBtn')}
            </button>
          </div>
        </Modal>
      )}

      {actionModal?.mode === 'markPaid' && (
        <Modal title={t('markPaidModalTitle')} onClose={() => setActionModal(null)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-slate-500">{t('markPaidDate')}</label>
              <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5" value={markPaidForm.paidAt} onChange={(e) => setMarkPaidForm({ ...markPaidForm, paidAt: e.target.value })}/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('markPaidRef')}</label>
              <input className="w-full border border-slate-300 rounded px-2 py-1.5" placeholder={t('markPaidRefPlaceholder')} value={markPaidForm.paidReference} onChange={(e) => setMarkPaidForm({ ...markPaidForm, paidReference: e.target.value })}/>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {t('markPaidFutureHint')}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setActionModal(null)} className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">{t('cancelBtn')}</button>
            <button onClick={handleMarkPaid} className="text-sm px-3 py-1.5 rounded bg-emerald-700 text-white hover:bg-emerald-800 inline-flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> {t('markPaidConfirmBtn')}
            </button>
          </div>
        </Modal>
      )}

      {actionModal?.mode === 'profile' && (
        <Modal title={t('adminProfileEditTitle')} onClose={() => setActionModal(null)}>
          {profileLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 載入中...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {([
                ['profileLegalNameEn', 'legalNameEn', 'text'],
                ['profileLegalNameZh', 'legalNameZh', 'text'],
                ['profileHkid', 'hkid', 'text'],
                ['profilePassport', 'passportNo', 'text'],
                ['profileDob', 'dateOfBirth', 'date'],
                ['profileJobTitle', 'jobTitle', 'text'],
                ['profileDepartment', 'department', 'text'],
                ['profileDateJoined', 'dateJoined', 'date'],
                ['profileDefaultBaseSalaryHkd', 'defaultBaseSalaryHkd', 'number'],
                ['profileBankName', 'bankName', 'text'],
                ['profileBankAccountNo', 'bankAccountNo', 'text'],
                ['profileMpfAccountNo', 'mpfAccountNo', 'text'],
                ['profileAddressLine1', 'addressLine1', 'text'],
                ['profileAddressLine2', 'addressLine2', 'text'],
                ['profileContactPhone', 'contactPhone', 'tel'],
                ['profileContactEmail', 'contactEmail', 'email'],
                ['profileEmergencyName', 'emergencyName', 'text'],
                ['profileEmergencyPhone', 'emergencyPhone', 'tel'],
              ] as const).map(([tKey, formKey, type]) => (
                <div key={formKey}>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">{t(tKey)}</label>
                  {type === 'number' ? (
                    <ZeroFriendlyNumberInput
                      value={(profileForm as any)[formKey] ?? 0}
                      onChange={(value) =>
                        setProfileForm((p: FullProfileForm) => ({
                          ...p,
                          [formKey]: value,
                        }))
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1.5"
                    />
                  ) : (
                    <input
                      type={type}
                      className="w-full border border-slate-300 rounded px-2 py-1.5"
                      value={(profileForm as any)[formKey] ?? ''}
                      onChange={(e) =>
                        setProfileForm((p: FullProfileForm) => ({
                          ...p,
                          [formKey]: e.target.value ? e.target.value : null,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setActionModal(null)} className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">
              {t('cancelBtn')}
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={profileLoading}
              className="text-sm px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {t('saveProfile')}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

/* ---------- helpers ---------- */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeNumericInputValue(value: number | null | undefined) {
  return Number.isFinite(value as number) ? String(Number(value)) : '0';
}

function ZeroFriendlyNumberInput({
  value,
  onChange,
  className,
  step = '0.01',
  disabled = false,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className: string;
  step?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => normalizeNumericInputValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(normalizeNumericInputValue(value));
  }, [value, focused]);

  return (
    <input
      type="number"
      step={step}
      disabled={disabled}
      className={className}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        if (Number(value ?? 0) === 0) {
          setText('');
        }
        requestAnimationFrame(() => e.currentTarget.select());
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        onChange(next === '' ? 0 : Number(next));
      }}
      onBlur={() => {
        setFocused(false);
        if (text === '' || Number.isNaN(Number(text))) {
          setText('0');
          onChange(0);
          return;
        }
        const normalized = normalizeNumericInputValue(Number(text));
        setText(normalized);
        onChange(Number(text));
      }}
    />
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <ZeroFriendlyNumberInput
        value={value}
        onChange={onChange}
        className="w-full border border-slate-300 rounded px-2 py-1.5"
      />
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'slate' | 'blue' | 'emerald' | 'rose' | 'indigo' }) {
  const toneMap = {
    slate: 'from-slate-50 to-white border-slate-200 text-slate-700',
    blue: 'from-sky-50 to-white border-sky-200 text-sky-800',
    emerald: 'from-emerald-50 to-white border-emerald-200 text-emerald-800',
    rose: 'from-rose-50 to-white border-rose-200 text-rose-800',
    indigo: 'from-indigo-50 to-white border-indigo-200 text-indigo-800',
  } as const;
  return (
    <div className={`bg-gradient-to-b ${toneMap[tone]} border rounded-lg p-3 shadow-sm`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      <div className="font-bold text-lg tabular-nums leading-snug break-all">{value}</div>
      {sub && <div className="text-[11px] mt-1 opacity-80">{sub}</div>}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <div className="font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
