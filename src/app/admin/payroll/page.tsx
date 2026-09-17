import { redirect } from 'next/navigation';
import { getSession } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import AdminPayrollClient from './AdminPayrollClient';
import { getPluginFlags } from '@/app/actions/settings';
import { access } from 'fs';

export const dynamic = 'force-dynamic';

export default async function AdminPayrollPage() {
  const session = await getSession();
  if (!session?.isAdmin) redirect('/');

  const flags = await getPluginFlags();
  if (!flags.payroll) redirect('/');

  const initialCycles = await prisma.salaryCycle.findMany({
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      cycleType: true,
      periodStart: true,
      periodEnd: true,
      payrollDate: true,
      status: true,
      note: true,
      headcountTotal: true,
      headcountConfirmed: true,
      headcountPaid: true,
      grossTotalHkd: true,
      deductionTotalHkd: true,
      netPayableTotalHkd: true,
      amountPaidTotalHkd: true,
    },
  });

  const allUsers = await prisma.user.findMany({
    orderBy: [{ roleName: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      roleName: true,
      isAdmin: true,
      profile: {
        select: {
          legalNameEn: true,
          legalNameZh: true,
          department: true,
          jobTitle: true,
        },
      },
    },
  });

  const departments: string[] = [];
  (allUsers).forEach((u) => {
    const d = u.profile?.department;
    if (d && !departments.includes(d)) departments.push(d);
  });
  const jobTitles: string[] = [];
  (allUsers).forEach((u) => {
    const j = u.profile?.jobTitle;
    if (j && !jobTitles.includes(j)) jobTitles.push(j);
  });

  const today = new Date();
  const defaultRangeStart = new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10);

  return (
    <AdminPayrollClient
      initialCycles={JSON.parse(JSON.stringify(initialCycles))}
      allUsers={JSON.parse(JSON.stringify(allUsers))}
      departments={departments}
      jobTitles={jobTitles}
      defaultPeriodStartGte={defaultRangeStart}
    />
  );
}

// import access 避免 tree-shake 警告，保留此註釋
void access;
