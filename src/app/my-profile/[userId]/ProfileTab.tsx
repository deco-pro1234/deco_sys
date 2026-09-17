'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, User as UserIcon } from 'lucide-react';
import { getMyProfile, saveMyProfile } from '@/app/actions/payroll';

export type ProfileRow = {
  userId: string;
  legalNameEn: string;
  legalNameZh: string | null;
  hkid: string | null;
  passportNo: string | null;
  dateOfBirth: string | null;
  jobTitle: string | null;
  department: string | null;
  dateJoined: string | null;
  dateOfTermination: string | null;
  defaultBaseSalaryHkd: number | null;
  bankName: string | null;
  bankAccountNo: string | null;
  mpfAccountNo: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Props = {
  userId: string;
  isAdmin: boolean;
  isSelf: boolean;
  userRoleName: string;
  initial: ProfileRow | null;
};

function toInputDate(s: string | Date | null | undefined) {
  if (!s) return '';
  const d = typeof s === 'string' ? new Date(s) : s;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeNumericInputValue(value: number | null | undefined) {
  return Number.isFinite(value as number) ? String(Number(value)) : '0';
}

function ZeroFriendlyNumberInput({
  value,
  onChange,
  className,
  disabled = false,
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  className: string;
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
      step="0.01"
      disabled={disabled}
      className={className}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        if (Number(value ?? 0) === 0) setText('');
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

export default function ProfileTab(props: Props) {
  const [form, setForm] = useState<ProfileRow>(() =>
    props.initial ?? {
      userId: props.userId,
      legalNameEn: '',
      legalNameZh: '',
      hkid: '',
      passportNo: '',
      dateOfBirth: null,
      jobTitle: '',
      department: '',
      dateJoined: null,
      dateOfTermination: null,
      defaultBaseSalaryHkd: 0,
      bankName: '',
      bankAccountNo: '',
      mpfAccountNo: '',
      addressLine1: '',
      addressLine2: '',
      contactPhone: '',
      contactEmail: '',
      emergencyName: '',
      emergencyPhone: '',
    },
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const readonly = !props.isSelf && !props.isAdmin;

  const onChange = <K extends keyof ProfileRow>(key: K, value: ProfileRow[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    if (readonly) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveMyProfile(props.userId, form);
      const refreshed = await getMyProfile(props.userId);
      if (refreshed) {
        const casted = refreshed as unknown as ProfileRow;
        setForm(JSON.parse(JSON.stringify({
          ...refreshed,
          dateOfBirth: toInputDate(casted.dateOfBirth),
          dateJoined: toInputDate(casted.dateJoined),
          dateOfTermination: toInputDate(casted.dateOfTermination),
        })));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">個人資料 User Profile</div>
            <div className="text-xs text-slate-500">
              {props.isSelf ? '此資料用於支薪證明 PDF 抬頭 / 受款人資料' : `檢視用戶: ${props.userRoleName}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              <CheckCircle2 className="w-3 h-3" /> 已儲存
            </span>
          )}
          <button
            onClick={onSave}
            disabled={readonly || saving}
            className="inline-flex items-center gap-1.5 text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 rounded px-3 py-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 儲存
          </button>
        </div>
      </div>
      <div className="p-4 space-y-4 text-sm">
        <Section title="法定姓名 (必填)">
          <Field label="英文姓名 Legal Name *">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.legalNameEn} onChange={(e) => onChange('legalNameEn', e.target.value)} placeholder="e.g. CHAN TAI MAN"/>
          </Field>
          <Field label="中文姓名">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.legalNameZh ?? ''} onChange={(e) => onChange('legalNameZh', e.target.value)} placeholder="陳大文"/>
          </Field>
        </Section>
        <Section title="身份證明文件">
          <Field label="香港身份證 HKID">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.hkid ?? ''} onChange={(e) => onChange('hkid', e.target.value)} placeholder="A123456(7) (PDF 自動遮罩)"/>
          </Field>
          <Field label="護照 Passport No.">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.passportNo ?? ''} onChange={(e) => onChange('passportNo', e.target.value)} />
          </Field>
          <Field label="出生日期 DOB">
            <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={toInputDate(form.dateOfBirth)} onChange={(e) => onChange('dateOfBirth', e.target.value || null)} />
          </Field>
        </Section>
        <Section title="受僱資料 Employment">
          <Field label="職稱 Job Title">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.jobTitle ?? ''} onChange={(e) => onChange('jobTitle', e.target.value)} placeholder="Administrative Officer"/>
          </Field>
          <Field label="部門 Department">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.department ?? ''} onChange={(e) => onChange('department', e.target.value)} placeholder="Admin"/>
          </Field>
          <Field label="入職日期 Date Joined">
            <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={toInputDate(form.dateJoined)} onChange={(e) => onChange('dateJoined', e.target.value || null)}/>
          </Field>
          {props.isAdmin && (
            <Field label="離職日期 Date of Termination (僅管理員可見/修改)">
              <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly || !props.isAdmin} value={toInputDate(form.dateOfTermination)} onChange={(e) => onChange('dateOfTermination', e.target.value || null)}/>
            </Field>
          )}
          <Field label="預設基本底薪 (HKS / HKD)">
            <ZeroFriendlyNumberInput
              value={form.defaultBaseSalaryHkd ?? 0}
              onChange={(value) => onChange('defaultBaseSalaryHkd', value)}
              disabled={!props.isAdmin}
              className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50"
            />
            {!props.isAdmin && <p className="text-[11px] text-slate-500 mt-1">由管理員設定；開薪資週期時自動帶入。</p>}
          </Field>
        </Section>
        <Section title="收款與福利">
          <Field label="銀行 Bank Name">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.bankName ?? ''} onChange={(e) => onChange('bankName', e.target.value)} placeholder="HSBC / Hang Seng"/>
          </Field>
          <Field label="帳號 Bank Account No.">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.bankAccountNo ?? ''} onChange={(e) => onChange('bankAccountNo', e.target.value)} placeholder="PDF 顯示只保留最後 4 碼"/>
          </Field>
          <Field label="強積金 MPF No.">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.mpfAccountNo ?? ''} onChange={(e) => onChange('mpfAccountNo', e.target.value)} />
          </Field>
        </Section>
        <Section title="聯絡 Contact">
          <Field label="地址 Address Line 1">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.addressLine1 ?? ''} onChange={(e) => onChange('addressLine1', e.target.value)} />
          </Field>
          <Field label="地址 Address Line 2">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.addressLine2 ?? ''} onChange={(e) => onChange('addressLine2', e.target.value)} />
          </Field>
          <Field label="電話 Phone（WhatsApp 身份）">
            <input
              type="tel"
              className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50"
              disabled={readonly}
              value={form.contactPhone ?? ''}
              onChange={(e) => onChange('contactPhone', e.target.value)}
              placeholder="85291234567"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              請含國碼。儲存後會自動綁定 WhatsApp 身份（香港 8 位號碼可只填本地號）。
            </p>
          </Field>
          <Field label="電郵 Email">
            <input type="email" className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.contactEmail ?? ''} onChange={(e) => onChange('contactEmail', e.target.value)} />
          </Field>
        </Section>
        <Section title="緊急聯絡人 (僅存檔, 不顯示 PDF)">
          <Field label="姓名">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.emergencyName ?? ''} onChange={(e) => onChange('emergencyName', e.target.value)}/>
          </Field>
          <Field label="電話">
            <input className="w-full border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50" disabled={readonly} value={form.emergencyPhone ?? ''} onChange={(e) => onChange('emergencyPhone', e.target.value)}/>
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 border-l-2 border-slate-900 pl-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
