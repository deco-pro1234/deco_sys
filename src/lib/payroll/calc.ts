export type PayrollItemInput = {
  id?: string;
  itemType: 'EARNING' | 'DEDUCTION';
  itemCode: string;
  itemName: string;
  sourceText?: string | null;
  unitCount?: number | null;
  unitRateHkd?: number | null;
  amountHkd: number;
  sortOrder?: number;
};

export type PayrollAmountsInput = {
  baseSalaryHkd: number;
  overtimeHkd?: number;
  bonusHkd?: number;
  commissionHkd?: number;
  allowanceItems?: PayrollItemInput[];
  deductionItems?: PayrollItemInput[];
};

export type ComputedPayroll = {
  baseSalaryHkd: number;
  overtimeHkd: number;
  bonusHkd: number;
  commissionHkd: number;
  allowanceTotalHkd: number;
  deductionTotalHkd: number;
  grossTotalHkd: number;
  netPayableHkd: number;
  /** HEADROOM applied amount (before cap) used for allowance total */
  allowanceTotalBeforeCapHkd: number;
  /** whether allowance cap rule was actually triggered */
  allowanceCapHit: boolean;
  /** whether net payable floor was hit (applied max(0, net)) */
  netFloorHit: boolean;
  items: PayrollItemInput[];
};

export const RULE_ALLOWANCE_CAP_RATIO = 0.3;

export function roundHkd(value: number): number {
  // HKD 小數到兩位
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Headroom / Cap 規則（對應設計偏好）：
 *   applied = base_delta * (100 - base_score) / 100 的精神：
 *   津貼合計不可超過底薪 × 30% (RULE_ALLOWANCE_CAP_RATIO)。
 *   超出時，等比例縮減每一項津貼 applied amount。
 *   最後 netPayable = max(0, gross - deduction) 下限保護，避免負數
 */
export function computePayroll(input: PayrollAmountsInput): ComputedPayroll {
  const baseSalaryHkd = roundHkd(input.baseSalaryHkd || 0);
  const overtimeHkd = roundHkd(input.overtimeHkd || 0);
  const bonusHkd = roundHkd(input.bonusHkd || 0);
  const commissionHkd = roundHkd(input.commissionHkd || 0);

  const allowanceItems: PayrollItemInput[] = (input.allowanceItems || []).map((it, i) => ({
    ...it,
    itemType: 'EARNING',
    amountHkd: roundHkd(it.amountHkd || 0),
    sortOrder: it.sortOrder ?? (100 + i),
  }));
  const deductionItems: PayrollItemInput[] = (input.deductionItems || []).map((it, i) => ({
    ...it,
    itemType: 'DEDUCTION',
    amountHkd: roundHkd(it.amountHkd || 0),
    sortOrder: it.sortOrder ?? (300 + i),
  }));

  const allowanceRawTotal = allowanceItems.reduce((s, it) => s + it.amountHkd, 0);
  const allowanceCap = roundHkd(baseSalaryHkd * RULE_ALLOWANCE_CAP_RATIO);
  const allowanceTotalBeforeCapHkd = roundHkd(allowanceRawTotal);
  let allowanceCapHit = false;

  const finalAllowanceItems: PayrollItemInput[] = allowanceItems.map((it) => ({ ...it }));
  let appliedAllowanceTotal = allowanceTotalBeforeCapHkd;
  if (allowanceTotalBeforeCapHkd > allowanceCap && allowanceCap >= 0) {
    allowanceCapHit = true;
    const scale =
      allowanceTotalBeforeCapHkd === 0 ? 0 : allowanceCap / allowanceTotalBeforeCapHkd;
    // 每一項津貼按比例縮減（Headroom 縮放）
    let remaining = allowanceCap;
    for (let i = 0; i < finalAllowanceItems.length; i++) {
      const orig = finalAllowanceItems[i].amountHkd;
      const scaled = i === finalAllowanceItems.length - 1
        ? remaining
        : roundHkd(orig * scale);
      finalAllowanceItems[i] = {
        ...finalAllowanceItems[i],
        amountHkd: scaled,
        sourceText: [
          finalAllowanceItems[i].sourceText,
          `(allowance cap rule: applied = base × 30% headroom × scale_factor=${scale.toFixed(4)}; original=${orig}, applied=${scaled})`,
        ]
          .filter(Boolean)
          .join(' | '),
      };
      remaining = roundHkd(remaining - scaled);
    }
    appliedAllowanceTotal = roundHkd(allowanceCap);
  }

  const allowanceTotalHkd = roundHkd(appliedAllowanceTotal);
  const deductionTotalHkd = roundHkd(
    deductionItems.reduce((s, it) => s + it.amountHkd, 0),
  );

  const grossTotalHkd = roundHkd(
    baseSalaryHkd + overtimeHkd + bonusHkd + commissionHkd + allowanceTotalHkd,
  );
  const netBeforeFloor = roundHkd(grossTotalHkd - deductionTotalHkd);
  const netFloorHit = netBeforeFloor < 0;
  const netPayableHkd = Math.max(0, netBeforeFloor);

  // 彙總 items：將 base / overtime / bonus / commission 也合成為 PayrollItem 方便追溯
  const summaryItems: PayrollItemInput[] = [
    {
      itemType: 'EARNING',
      itemCode: 'BASE_SALARY',
      itemName: '基本薪金',
      sourceText: baseSalaryHkd > 0
        ? `rule: FULL_MONTH_BASE (HKD ${baseSalaryHkd.toFixed(2)})`
        : undefined,
      amountHkd: baseSalaryHkd,
      sortOrder: 0,
    },
    ...(overtimeHkd > 0
      ? [{
          itemType: 'EARNING' as const,
          itemCode: 'OVERTIME',
          itemName: '加班費',
          sourceText: `加班費合計 (rule: sum of overtime items × 倍率)`,
          amountHkd: overtimeHkd,
          sortOrder: 1,
        }]
      : []),
    ...(bonusHkd > 0
      ? [{
          itemType: 'EARNING' as const,
          itemCode: 'BONUS_ANNUAL',
          itemName: '獎金 / 花紅',
          sourceText: `獎金/花紅發放 (rule: admin-discretionary / KPI)`,
          amountHkd: bonusHkd,
          sortOrder: 2,
        }]
      : []),
    ...(commissionHkd > 0
      ? [{
          itemType: 'EARNING' as const,
          itemCode: 'COMMISSION',
          itemName: '佣金',
          sourceText: `佣金 (rule: performance × rate)`,
          amountHkd: commissionHkd,
          sortOrder: 3,
        }]
      : []),
  ];

  const items = [...summaryItems, ...finalAllowanceItems, ...deductionItems].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  return {
    baseSalaryHkd,
    overtimeHkd,
    bonusHkd,
    commissionHkd,
    allowanceTotalHkd,
    deductionTotalHkd,
    grossTotalHkd,
    netPayableHkd,
    allowanceTotalBeforeCapHkd,
    allowanceCapHit,
    netFloorHit,
    items,
  };
}

export type UserProfileSnapshotInput = {
  legalNameEn: string;
  legalNameZh?: string | null;
  hkid?: string | null;
  passportNo?: string | null;
  dateOfBirth?: Date | string | null;
  jobTitle?: string | null;
  department?: string | null;
  dateJoined?: Date | string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  mpfAccountNo?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  defaultBaseSalaryHkd?: number | null;
};

export function snapshotProfile(p: UserProfileSnapshotInput) {
  const formatDate = (d: Date | string | null | undefined) =>
    d ? (typeof d === 'string' ? d : new Date(d).toISOString()) : null;
  const mask = (s: string | null | undefined, visibleLast = 4) => {
    if (!s) return null;
    if (s.length <= visibleLast) return 'X'.repeat(s.length);
    return 'X'.repeat(s.length - visibleLast) + s.slice(s.length - visibleLast);
  };
  return {
    legalNameEn: p.legalNameEn,
    legalNameZh: p.legalNameZh ?? null,
    hkidMasked: mask(p.hkid ?? null),
    passportNoMasked: mask(p.passportNo ?? null),
    dateOfBirthIso: formatDate(p.dateOfBirth),
    jobTitle: p.jobTitle ?? null,
    department: p.department ?? null,
    dateJoinedIso: formatDate(p.dateJoined),
    bankName: p.bankName ?? null,
    bankAccountNoLast4: mask(p.bankAccountNo ?? null, 4),
    mpfAccountNoMasked: mask(p.mpfAccountNo ?? null),
    addressLine1: p.addressLine1 ?? null,
    addressLine2: p.addressLine2 ?? null,
    contactPhone: p.contactPhone ?? null,
    contactEmail: p.contactEmail ?? null,
    defaultBaseSalaryHkd: p.defaultBaseSalaryHkd ?? null,
    snapshotTakenAtIso: new Date().toISOString(),
  };
}

export type SnapshotProfile = ReturnType<typeof snapshotProfile>;
