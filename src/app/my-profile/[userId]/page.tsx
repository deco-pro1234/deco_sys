import { redirect } from 'next/navigation';
import { getSession } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import ProfileTab from './ProfileTab';
import PayrollTab from './PayrollTab';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default async function MyProfilePage(props: PageProps) {
  const params = await props.params;
  const targetUserId = params.userId;
  const session = await getSession();
  if (!session) redirect('/login');
  const canView = session.isAdmin || session.userId === targetUserId;
  if (!canView) redirect('/');

  const profile = await prisma.userProfile.findUnique({ where: { userId: targetUserId } });
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, roleName: true, isAdmin: true, createdAt: true },
  });
  if (!user) redirect('/');

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          個人資料與薪資 / My Profile &amp; Payroll
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          {session.isAdmin ? '管理員檢視模式' : '您可以在此更新個人資料、確認薪資單、下載支薪證明 PDF。'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <ProfileTab
            userId={targetUserId}
            isAdmin={!!session.isAdmin}
            isSelf={session.userId === targetUserId}
            userRoleName={user.roleName}
            initial={profile ? JSON.parse(JSON.stringify(profile)) : null}
          />
        </div>
        <div className="lg:col-span-3">
          <PayrollTab
            userId={targetUserId}
            isAdmin={!!session.isAdmin}
            isSelf={session.userId === targetUserId}
          />
        </div>
      </div>
    </div>
  );
}
