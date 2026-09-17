import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../actions/auth";
import { getCategories } from "../actions/category";
import { queryAttachmentsForAdmin } from "../actions/attachment";
import { getCapitalPools } from "../actions/pool";
import { getUsers } from "../actions/user";
import AdminTabs from "./AdminTabs";
import { getCurrentLocale } from "@/lib/locale";
import { createTranslator } from "@/lib/i18n";
import { getDefaultHomePath } from "@/lib/access";
import { getAISettings, getPluginFlags } from "../actions/settings";
import { listWhatsAppBindings } from "../actions/whatsapp";

export const metadata = {
  title: "管理后台",
};

export default async function AdminPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  if (!session.isAdmin) {
    redirect(getDefaultHomePath(session));
  }
  const locale = await getCurrentLocale();
  const t = createTranslator(locale);

  // 获取各个模块的数据
  const categories = await getCategories();
  const attachments = await queryAttachmentsForAdmin({ source: 'ALL' });
  const pools = await getCapitalPools();
  const users = await getUsers();
  const aiSettings = await getAISettings();
  const pluginFlags = await getPluginFlags();
  const whatsappBindings = await listWhatsAppBindings();

  return (
    <div className="bg-[#F2F2F7] min-h-screen">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[#007AFF] text-sm font-semibold hover:opacity-80">
              ‹ {t('backHome')}
            </Link>
            <h1 className="text-lg font-bold text-gray-900">{t('adminPage')}</h1>
          </div>
          {pluginFlags.payroll ? (
            <Link
              href="/admin/payroll"
              className="rounded-xl bg-[#FF9500] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E08600]"
            >
              💼 {t('payroll')}
            </Link>
          ) : null}
        </div>
      </header>

      {/* 选项卡及内容组件 */}
      <main>
        <AdminTabs
          initialCategories={categories}
          initialAttachments={attachments}
          initialPools={pools}
          initialUsers={users}
          initialAISettings={aiSettings}
          initialPluginFlags={pluginFlags}
          initialWhatsAppBindings={whatsappBindings}
          locale={locale}
        />
      </main>
    </div>
  );
}
