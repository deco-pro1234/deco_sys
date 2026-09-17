"use client";

import { useEffect, useState } from "react";
import { createCategory, deleteCategory } from "../actions/category";
import { createCapitalPool, deleteCapitalPool } from "../actions/pool";
import { createUser, updateUser, deleteUser, toggleUserPool } from "../actions/user";
import { adminUpdateUserProfile, getMyProfile } from "../actions/payroll";
import { createTranslator, formatCurrency, type Locale } from "@/lib/i18n";
import { updateAISettings, updatePluginFlags, type AISettings } from "../actions/settings";
import type { PluginFlags } from "@/lib/plugins";
import {
  queryAttachmentsForAdmin,
  bulkDeleteAttachments,
  type AttachmentSourceFilter,
} from "../actions/attachment";
import type { UserProfileSnapshotInput } from "@/lib/payroll/calc";
import { openAttachment } from "@/lib/image";
import {
  listWhatsAppBindings,
  removeWhatsAppBinding,
  upsertWhatsAppBinding,
} from "../actions/whatsapp";

type WhatsAppBindingRow = {
  id: string
  phoneE164: string
  enabled: boolean
  user: { id: string; roleName: string; email: string; isAdmin: boolean }
}

type AdminTabsProps = {
  initialCategories: any[]
  initialAttachments: any[]
  initialPools: any[]
  initialUsers: any[]
  initialAISettings: AISettings
  initialPluginFlags: PluginFlags
  initialWhatsAppBindings: WhatsAppBindingRow[]
  locale: Locale
}

export default function AdminTabs({ initialCategories, initialAttachments, initialPools, initialUsers, initialAISettings, initialPluginFlags, initialWhatsAppBindings, locale }: AdminTabsProps) {
  const t = createTranslator(locale as Locale);
  const [activeTab, setActiveTab] = useState("category");
  
  const tabs = [
    { id: "category", label: t('categoryManagement') },
    { id: "attachment", label: t('attachmentManagement') },
    { id: "pool", label: t('poolManagement') },
    { id: "user", label: t('userManagement') },
    { id: "ai-settings", label: t('aiSettings') },
    { id: "plugins", label: t('plugins') },
    { id: "whatsapp", label: t('whatsapp') },
  ];

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-20 md:pb-0">
      {/* 顶部导航栏 */}
      <div className="bg-[#F2F2F7] sticky top-0 z-10 pt-2 border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-6 overflow-x-auto pb-3 pt-1 scrollbar-hide text-lg font-semibold">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "text-[#007AFF] border-b-2 border-[#007AFF]"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-5xl mx-auto p-4 sm:px-6 lg:px-8 mt-4">
        {activeTab === "category" && <CategoryTab categories={initialCategories} locale={locale} />}
        {activeTab === "attachment" && (
          <AttachmentTab
            initialAttachments={initialAttachments}
            pools={initialPools}
            locale={locale}
          />
        )}
        {activeTab === "pool" && <PoolTab pools={initialPools} users={initialUsers} locale={locale} />}
        {activeTab === "user" && <UserTab initialUsers={initialUsers} locale={locale} />}
        {activeTab === "ai-settings" && <AISettingsTab initialSettings={initialAISettings} locale={locale} />}
        {activeTab === "plugins" && <PluginsTab initialFlags={initialPluginFlags} locale={locale} />}
        {activeTab === "whatsapp" && (
          <WhatsAppTab
            initialBindings={initialWhatsAppBindings}
            users={initialUsers}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}

// ---------------- 分类管理组件 ----------------
function CategoryTab({ categories, locale }: { categories: any[], locale: Locale }) {
  const t = createTranslator(locale);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [loading, setLoading] = useState(false);
  const [addingSubCatTo, setAddingSubCatTo] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState("");

  const handleCreateMain = async () => {
    if (!newCatName.trim()) return;
    setLoading(true);
    await createCategory(newCatName.trim(), undefined, newCatType);
    setNewCatName("");
    setLoading(false);
  };

  const handleCreateSub = async (parentId: string) => {
    if (!newSubCatName.trim()) return;
    setLoading(true);
    await createCategory(newSubCatName.trim(), parentId);
    setNewSubCatName("");
    setAddingSubCatTo(null);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteCategoryConfirm'))) {
      await deleteCategory(id);
    }
  };

  const renderCategoryNode = (cat: any, level: number = 0) => (
    <div key={cat.id} className={`${level === 0 ? 'bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden' : ''}`}>
      <div className={`flex items-center justify-between ${level === 0 ? 'p-4 bg-[#F2F2F7]/50' : 'p-2 hover:bg-gray-50 rounded-lg'} ${level > 0 ? 'ml-4 border-l-2 border-gray-100 pl-4' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`${level === 0 ? 'text-gray-900 font-semibold text-base' : 'text-gray-700 text-sm font-medium'}`}>{cat.name}</span>
          {level === 0 && cat.name !== "未分类" && (
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${cat.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'}`}>
              {cat.type === 'INCOME' ? t('income') : t('expense')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {cat.name !== "未分类" && level < 2 && (
            <button
              onClick={() => setAddingSubCatTo(cat.id)}
              className="text-[#007AFF] hover:text-[#0066CC] text-sm font-semibold px-2 py-1"
            >
              {level === 0 ? t('addSubCategory') : t('addGrandCategory')}
            </button>
          )}
          {cat.name !== "未分类" && (
            <button
              onClick={() => handleDelete(cat.id)}
              className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
            >
              {t('delete')}
            </button>
          )}
        </div>
      </div>

      <div className={`${level === 0 ? 'p-3 bg-white space-y-2' : 'space-y-2'}`}>
        {addingSubCatTo === cat.id && (
          <div className="flex gap-2 mb-3 ml-4 border-l-2 border-[#007AFF]/30 pl-4">
            <input
              type="text"
              value={newSubCatName}
              onChange={(e) => setNewSubCatName(e.target.value)}
              placeholder={level === 0 ? t('subCategory') : t('grandCategory')}
              className="flex-1 px-3 py-2 bg-[#F2F2F7] border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
              autoFocus
            />
            <button
              onClick={() => handleCreateSub(cat.id)}
              disabled={loading}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-lg text-sm font-semibold"
            >
              {t('save')}
            </button>
            <button
              onClick={() => setAddingSubCatTo(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold"
            >
              {t('cancel')}
            </button>
          </div>
        )}

        {cat.children && cat.children.length > 0 ? (
          <div className="space-y-1.5">
            {cat.children.map((child: any) => renderCategoryNode(child, level + 1))}
          </div>
        ) : level === 0 ? (
          <div className="text-xs text-gray-400 pl-4 py-1 italic">{t('noSubCategory')}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('categoryManagement')}</h2>
      
      {/* 添加新主分类 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-[#F2F2F7] p-4 rounded-2xl">
        <input
          type="text"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder={t('newMainCategoryName')}
          className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm transition-all text-gray-900 placeholder-gray-400"
        />
        <select
          value={newCatType}
          onChange={(e) => setNewCatType(e.target.value as "INCOME" | "EXPENSE")}
          className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
        >
          <option value="EXPENSE">{t('expenseCategory')}</option>
          <option value="INCOME">{t('incomeCategory')}</option>
        </select>
        <button
          onClick={handleCreateMain}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm"
        >
          {t('addCategory')}
        </button>
      </div>

      {/* 分类列表 */}
      <div className="space-y-4">
        {categories.map((cat) => renderCategoryNode(cat))}
        {categories.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">{t('noCategoryData')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 附件管理组件 ----------------
function attachmentSourceOf(att: any): AttachmentSourceFilter | 'OTHER' {
  if (att.recordId || att.record) return 'RECORD'
  if (att.privateRecordId || att.privateRecord) return 'PRIVATE'
  if (att.activityId || att.activity) return 'ACTIVITY'
  if (att.contractId || att.contract) return 'CONTRACT'
  return 'OTHER'
}

function AttachmentTab({
  initialAttachments,
  pools,
  locale,
}: {
  initialAttachments: any[]
  pools: any[]
  locale: Locale
}) {
  const t = createTranslator(locale)
  const dateLocale = locale === 'en' ? 'en-HK' : 'zh-HK'
  const inputClass =
    'w-full rounded-xl border border-transparent bg-[#F2F2F7] px-3 py-2.5 text-sm text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30'

  const [attachments, setAttachments] = useState<any[]>(initialAttachments)
  const [source, setSource] = useState<AttachmentSourceFilter>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [poolId, setPoolId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sourceLabel = (att: any) => {
    const s = attachmentSourceOf(att)
    if (s === 'RECORD') return t('attachmentSourceRecord')
    if (s === 'PRIVATE') return t('attachmentSourcePrivate')
    if (s === 'ACTIVITY') return t('attachmentSourceActivity')
    if (s === 'CONTRACT') return t('attachmentSourceContract')
    return t('unknown')
  }

  const detailLabel = (att: any) => {
    if (att.record) return att.record.note || att.record.id.slice(-8)
    if (att.privateRecord) return att.privateRecord.note || att.privateRecord.id.slice(-8)
    if (att.activity) return att.activity.title
    if (att.contract) return att.contract.title
    return '-'
  }

  const poolLabel = (att: any) =>
    att.record?.pool?.name || att.contract?.pool?.name || '-'

  const allSelected =
    attachments.length > 0 && attachments.every((a) => selectedIds.includes(a.id))

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([])
      return
    }
    setSelectedIds(attachments.map((a) => a.id))
  }

  const handleSearch = async () => {
    setLoading(true)
    try {
      const filter: {
        source: AttachmentSourceFilter
        startDate?: Date
        endDate?: Date
        poolId?: string
      } = { source }
      if (startDate) filter.startDate = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        filter.endDate = end
      }
      if (poolId) filter.poolId = poolId

      const rows = await queryAttachmentsForAdmin(filter)
      setAttachments(rows)
      setSelectedIds([])
    } catch (e) {
      console.error(e)
      alert(t('queryFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert(t('noAttachmentSelected'))
      return
    }
    const msg = t('bulkDeleteAttachmentsConfirm').replace('{count}', String(selectedIds.length))
    if (!window.confirm(msg)) return

    setDeleting(true)
    const res = await bulkDeleteAttachments(selectedIds)
    if (!res.success) {
      alert(res.error)
      setDeleting(false)
      return
    }
    alert(t('bulkDeleteAttachmentsDone').replace('{count}', String(res.deleted)))
    setSelectedIds([])
    await handleSearch()
    setDeleting(false)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{t('attachmentManagement')}</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('attachmentSource')}
          </label>
          <select value={source} onChange={(e) => setSource(e.target.value as AttachmentSourceFilter)} className={inputClass}>
            <option value="ALL">{t('attachmentSourceAll')}</option>
            <option value="RECORD">{t('attachmentSourceRecord')}</option>
            <option value="PRIVATE">{t('attachmentSourcePrivate')}</option>
            <option value="ACTIVITY">{t('attachmentSourceActivity')}</option>
            <option value="CONTRACT">{t('attachmentSourceContract')}</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('startDate')}
          </label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('endDate')}
          </label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t('attachmentPool')}
          </label>
          <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className={inputClass}>
            <option value="">{t('all')}</option>
            {pools.map((pool: any) => (
              <option key={pool.id} value={pool.id}>{pool.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || deleting}
          className="rounded-xl bg-[#007AFF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {loading ? t('queryLoading') : t('queryAttachments')}
        </button>
        <button
          type="button"
          onClick={toggleAll}
          disabled={attachments.length === 0 || loading || deleting}
          className="rounded-xl bg-[#F2F2F7] px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          {t('selectAllAttachments')}
        </button>
        <span className="text-sm text-gray-500">
          {t('selectedAttachmentCount').replace('{count}', String(selectedIds.length))}
        </span>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={selectedIds.length === 0 || loading || deleting}
          className="ml-auto rounded-xl bg-[#FF3B30] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {deleting ? t('saving') : t('bulkDeleteAttachments')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {attachments.map((att) => {
          const checked = selectedIds.includes(att.id)
          return (
            <div
              key={att.id}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${
                checked ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20' : 'border-gray-100'
              }`}
            >
              <div className="relative flex h-32 items-center justify-center bg-[#F2F2F7]">
                <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(att.id)}
                    className="h-4 w-4 rounded text-[#007AFF]"
                  />
                </label>
                <img
                  src={att.fileUrl}
                  alt={t('attachmentPreview')}
                  className="h-full w-full cursor-pointer object-cover"
                  onClick={() => openAttachment(att.fileUrl)}
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div className="flex flex-col gap-1 p-3 text-xs text-gray-500">
                <span className="truncate font-medium text-gray-900">{att.uploader?.roleName || t('unknown')}</span>
                <span className="truncate">{t('attachmentSourceLabel')}: {sourceLabel(att)}</span>
                <span className="truncate">{t('detail')}: {detailLabel(att)}</span>
                <span className="truncate">{t('attachmentPool')}: {poolLabel(att)}</span>
                <span className="truncate">{t('attachmentUploadDate')}: {new Date(att.createdAt).toLocaleString(dateLocale)}</span>
                <span className="truncate">{t('note')}: {att.note || '-'}</span>
                <span className="truncate">{t('attachmentSize')}: {(att.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          )
        })}
        {attachments.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-gray-500">
            {t('noAttachmentMatch')}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------- 资金池管理组件 ----------------
function PoolTab({ pools, users, locale }: { pools: any[], users: any[], locale: Locale }) {
  const t = createTranslator(locale);
  const [newPoolName, setNewPoolName] = useState("");
  const [userId, setUserId] = useState("");
  const [isReviewRequired, setIsReviewRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newPoolName.trim()) return;
    setLoading(true);
    await createCapitalPool(newPoolName.trim(), userId || undefined, isReviewRequired);
    setNewPoolName("");
    setUserId("");
    setIsReviewRequired(false);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deletePoolConfirm'))) {
      const res = await deleteCapitalPool(id);
      if (!res.success) alert(res.error);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('poolManagement')}</h2>
      
      {/* 添加新资金池 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-[#F2F2F7] p-4 rounded-2xl">
        <input
          type="text"
          value={newPoolName}
          onChange={(e) => setNewPoolName(e.target.value)}
          placeholder={t('newPoolName')}
          className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
        />
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
        >
          <option value="">{t('publicPool')}</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{t('assignedTo')}: {u.roleName}</option>
          ))}
        </select>
        <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer bg-white px-4 rounded-xl border border-transparent">
          <input
            type="checkbox"
            checked={isReviewRequired}
            onChange={(e) => setIsReviewRequired(e.target.checked)}
            className="mr-2 rounded text-[#007AFF] focus:ring-[#007AFF]"
          />
          {t('reviewAccount')}
        </label>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm"
        >
          {t('add')}
        </button>
      </div>

      {/* 资金池列表 */}
      <div className="space-y-3">
        {pools.map((pool) => {
          const isDisabled = pool.user && pool.user.poolEnabled === false;
          return (
            <div key={pool.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors shadow-sm ${isDisabled ? 'bg-[#F2F2F7] border-transparent opacity-70' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>
                    {pool.name} {isDisabled && `(${t('disabled')})`}
                  </span>
                  {pool.isReviewRequired && (
                    <span className="px-2 py-0.5 bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-bold rounded">{t('reviewAccount')}</span>
                  )}
                  {pool.userId ? (
                    <span className="px-2 py-0.5 bg-[#007AFF]/10 text-[#007AFF] text-[10px] font-bold rounded">{t('assignedTo')}: {pool.user?.roleName}</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded">{t('public')}</span>
                  )}
                </div>
                <span className="text-xs font-medium text-gray-400">
                  {t('poolBalance')}: {formatCurrency(locale, pool.balanceHkd)}
                </span>
              </div>
              <button
                onClick={() => handleDelete(pool.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
              >
                {t('delete')}
              </button>
            </div>
          );
        })}
        {pools.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">{t('noPoolData')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 用户管理组件 ----------------
type FullProfileForm = {
  legalNameEn: string
  legalNameZh: string
  hkid: string
  passportNo: string
  dateOfBirth: string
  jobTitle: string
  department: string
  dateJoined: string
  defaultBaseSalaryHkd: number
  bankName: string
  bankAccountNo: string
  mpfAccountNo: string
  addressLine1: string
  addressLine2: string
  contactPhone: string
  contactEmail: string
  emergencyName: string
  emergencyPhone: string
}

const PROFILE_FIELD_DEFS: Array<{
  tKey: string
  key: keyof FullProfileForm
  type?: 'text' | 'date' | 'email' | 'tel' | 'number'
}> = [
  { tKey: 'profileLegalNameEn', key: 'legalNameEn' },
  { tKey: 'profileLegalNameZh', key: 'legalNameZh' },
  { tKey: 'profileHkid', key: 'hkid' },
  { tKey: 'profilePassport', key: 'passportNo' },
  { tKey: 'profileDob', key: 'dateOfBirth', type: 'date' },
  { tKey: 'profileJobTitle', key: 'jobTitle' },
  { tKey: 'profileDepartment', key: 'department' },
  { tKey: 'profileDateJoined', key: 'dateJoined', type: 'date' },
  { tKey: 'profileDefaultBaseSalaryHkd', key: 'defaultBaseSalaryHkd', type: 'number' },
  { tKey: 'profileBankName', key: 'bankName' },
  { tKey: 'profileBankAccountNo', key: 'bankAccountNo' },
  { tKey: 'profileMpfAccountNo', key: 'mpfAccountNo' },
  { tKey: 'profileAddressLine1', key: 'addressLine1' },
  { tKey: 'profileAddressLine2', key: 'addressLine2' },
  { tKey: 'profileContactPhone', key: 'contactPhone', type: 'tel' },
  { tKey: 'profileContactEmail', key: 'contactEmail', type: 'email' },
  { tKey: 'profileEmergencyName', key: 'emergencyName' },
  { tKey: 'profileEmergencyPhone', key: 'emergencyPhone', type: 'tel' },
]

const EMPTY_PROFILE: FullProfileForm = {
  legalNameEn: '', legalNameZh: '', hkid: '', passportNo: '',
  dateOfBirth: '', jobTitle: '', department: '', dateJoined: '',
  defaultBaseSalaryHkd: 0, bankName: '', bankAccountNo: '',
  mpfAccountNo: '', addressLine1: '', addressLine2: '',
  contactPhone: '', contactEmail: '', emergencyName: '', emergencyPhone: '',
}

const isProfileNonEmpty = (p: FullProfileForm) =>
  PROFILE_FIELD_DEFS.some(f => {
    const v = p[f.key]
    if (f.type === 'number') return Number(v) !== 0
    return !!String(v || '').trim()
  })

function normalizeNumericInputValue(value: number | null | undefined) {
  return Number.isFinite(value as number) ? String(Number(value)) : '0'
}

function ZeroFriendlyNumberInput({
  value,
  onChange,
  className,
}: {
  value: number | null | undefined
  onChange: (value: number) => void
  className: string
}) {
  const [text, setText] = useState(() => normalizeNumericInputValue(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(normalizeNumericInputValue(value))
  }, [value, focused])

  return (
    <input
      type="number"
      step="0.01"
      value={text}
      onFocus={(e) => {
        setFocused(true)
        if (Number(value ?? 0) === 0) setText('')
        requestAnimationFrame(() => e.currentTarget.select())
      }}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        onChange(next === '' ? 0 : Number(next))
      }}
      onBlur={() => {
        setFocused(false)
        if (text === '' || Number.isNaN(Number(text))) {
          setText('0')
          onChange(0)
          return
        }
        const normalized = normalizeNumericInputValue(Number(text))
        setText(normalized)
        onChange(Number(text))
      }}
      className={className}
    />
  )
}

function UserTab({ initialUsers, locale }: { initialUsers: any[], locale: Locale }) {
  const t = createTranslator(locale)
  const [users, setUsers] = useState<any[]>(initialUsers)

  // ---- 新增用戶表單 ----
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [newPublicLedgerRole, setNewPublicLedgerRole] = useState<'NONE' | 'MEMBER'>('NONE')
  const [newOcrEnabled, setNewOcrEnabled] = useState(true)
  const [expandPersonalInfo, setExpandPersonalInfo] = useState(false)
  const [newProfile, setNewProfile] = useState<FullProfileForm>({ ...EMPTY_PROFILE })
  const [loading, setLoading] = useState(false)

  // ---- 既有使用者編輯 Modal ----
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<{
    email: string
    roleName: string
    newPassword: string
    confirmPassword: string
  } | null>(null)
  const [editProfile, setEditProfile] = useState<FullProfileForm>({ ...EMPTY_PROFILE })
  const [savingEdit, setSavingEdit] = useState(false)

  // ---- 其他共用 ----
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  const handleCreate = async () => {
    const roleName = newRoleName.trim()
    const email = newEmail.trim().toLowerCase()
    const pwd = newPassword
    const pwd2 = confirmPassword

    if (!email) return alert(t('accountRequired'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert(t('emailInvalid'))
    if (!roleName) return alert(t('roleNamePlaceholder'))
    if (!pwd) return alert(t('enterPassword'))
    if (pwd !== pwd2) return alert(t('passwordMismatch'))

    setLoading(true)
    const payload: any = {
      email,
      password: pwd,
      roleName,
      isAdmin,
      publicLedgerRole: isAdmin ? 'MEMBER' : newPublicLedgerRole,
      ocrEnabled: newOcrEnabled,
    }
    if (isProfileNonEmpty(newProfile)) payload.profile = { ...newProfile }

    const res = await createUser(payload)
    if (!res.success) {
      alert(res.error)
    } else {
      if (res.user) setUsers(prev => [res.user, ...prev])
      setNewEmail(''); setNewPassword(''); setConfirmPassword(''); setNewRoleName('')
      setIsAdmin(false); setNewPublicLedgerRole('NONE'); setNewOcrEnabled(true)
      setExpandPersonalInfo(false); setNewProfile({ ...EMPTY_PROFILE })
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteUserConfirm'))) {
      const res = await deleteUser(id)
      if (!res.success) alert(res.error)
      else setUsers(prev => prev.filter(u => u.id !== id))
    }
  }

  const handleTogglePool = async (id: string, enabled: boolean) => {
    const res = await toggleUserPool(id, enabled)
    if (!res.success) alert(res.error)
    else setUsers(prev => prev.map(u => u.id === id ? { ...u, poolEnabled: enabled } : u))
  }

  const handleUpdatePublicLedgerRole = async (id: string, publicLedgerRole: 'NONE' | 'MEMBER') => {
    setSavingUserId(id)
    const res = await updateUser(id, { publicLedgerRole })
    if (!res.success) alert(res.error)
    else setUsers(prev => prev.map(u => u.id === id ? { ...u, publicLedgerRole } : u))
    setSavingUserId(null)
  }

  const handleUpdateOcrPermission = async (id: string, ocrEnabled: boolean) => {
    setSavingUserId(id)
    const res = await updateUser(id, { ocrEnabled })
    if (!res.success) alert(res.error)
    else setUsers(prev => prev.map(u => u.id === id ? { ...u, ocrEnabled } : u))
    setSavingUserId(null)
  }

  const openEditModal = async (user: any) => {
    setEditingUser(user)
    setEditForm({
      email: user.email || '',
      roleName: user.roleName || '',
      newPassword: '',
      confirmPassword: '',
    })
    let p: FullProfileForm = { ...EMPTY_PROFILE }
    try {
      // getMyProfile 直接回傳 profile 物件（或 null），不是 { profile }
      const raw = await getMyProfile(user.id)
      if (raw) {
        p = {
          legalNameEn: (raw as any).legalNameEn || user.roleName || '',
          legalNameZh: (raw as any).legalNameZh || '',
          hkid: (raw as any).hkid || '',
          passportNo: (raw as any).passportNo || '',
          dateOfBirth: (raw as any).dateOfBirth
            ? new Date((raw as any).dateOfBirth).toISOString().slice(0, 10)
            : '',
          jobTitle: (raw as any).jobTitle || '',
          department: (raw as any).department || '',
          dateJoined: (raw as any).dateJoined
            ? new Date((raw as any).dateJoined).toISOString().slice(0, 10)
            : '',
          defaultBaseSalaryHkd: Number((raw as any).defaultBaseSalaryHkd) || 0,
          bankName: (raw as any).bankName || '',
          bankAccountNo: (raw as any).bankAccountNo || '',
          mpfAccountNo: (raw as any).mpfAccountNo || '',
          addressLine1: (raw as any).addressLine1 || '',
          addressLine2: (raw as any).addressLine2 || '',
          contactPhone: (raw as any).contactPhone || '',
          contactEmail: (raw as any).contactEmail || '',
          emergencyName: (raw as any).emergencyName || '',
          emergencyPhone: (raw as any).emergencyPhone || '',
        }
      } else {
        p.legalNameEn = user.roleName || ''
        p.contactPhone = user.profile?.contactPhone || user.whatsappBindings?.[0]?.phoneE164 || ''
      }
    } catch (_e) {
      p.legalNameEn = user.roleName || ''
      p.contactPhone = user.profile?.contactPhone || user.whatsappBindings?.[0]?.phoneE164 || ''
    }
    setEditProfile(p)
  }

  const closeEditModal = () => {
    setEditingUser(null); setEditForm(null); setEditProfile({ ...EMPTY_PROFILE })
  }

  const handleSaveEdit = async () => {
    if (!editingUser || !editForm) return
    const email = editForm.email.trim().toLowerCase()
    const roleName = editForm.roleName.trim()
    if (!email) return alert(t('accountRequired'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert(t('emailInvalid'))
    if (!roleName) return alert(t('roleNamePlaceholder'))
    if (editForm.newPassword && editForm.newPassword !== editForm.confirmPassword) {
      return alert(t('passwordMismatch'))
    }

    setSavingEdit(true)
    const userData: any = { email, roleName }
    if (editForm.newPassword) userData.password = editForm.newPassword

    let ok = true
    let msg = ''
    const res1 = await updateUser(editingUser.id, userData)
    if (!res1.success) { ok = false; msg = res1.error || 'update failed' }

    if (ok) {
      try {
        const profilePayload: any = { ...editProfile }
        profilePayload.legalNameEn = editProfile.legalNameEn.trim() || roleName
        await adminUpdateUserProfile(editingUser.id, profilePayload)
      } catch (err: any) {
        ok = false
        msg = err.message || 'profile save failed'
      }
    }

    if (ok) {
      alert(t('savedSuccess'))
      const phone = String(editProfile.contactPhone || '').replace(/\D/g, '')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                email,
                roleName,
                profile: { ...(u.profile || {}), contactPhone: phone || null },
                whatsappBindings: phone
                  ? [{ phoneE164: phone.startsWith('852') || phone.length > 8 ? phone : `852${phone}` }]
                  : [],
              }
            : u,
        ),
      )
      closeEditModal()
    } else {
      alert(msg)
    }
    setSavingEdit(false)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('userManagement')}</h2>
      
      {/* 添加新用户 */}
      <div className="bg-[#F2F2F7] p-5 rounded-2xl border-transparent mb-8 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700">{t('addUser')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder={t('roleNamePlaceholder')}
            className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('password')}
            className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('confirmPassword')}
            className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 sm:gap-x-6 sm:gap-y-3 items-center">
            <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="mr-2.5 rounded text-[#007AFF] focus:ring-[#007AFF]"
              />
              {t('setAdmin')}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span>{t('publicLedgerPermission')}</span>
              <select
                value={isAdmin ? 'MEMBER' : newPublicLedgerRole}
                onChange={(e) => setNewPublicLedgerRole(e.target.value as 'NONE' | 'MEMBER')}
                disabled={isAdmin}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none disabled:bg-gray-100"
              >
                <option value="NONE">{t('denyPublicLedger')}</option>
                <option value="MEMBER">{t('allowPublicLedger')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span>{t('ocrPermission')}</span>
              <select
                value={newOcrEnabled ? 'ENABLED' : 'DISABLED'}
                onChange={(e) => setNewOcrEnabled(e.target.value === 'ENABLED')}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none"
              >
                <option value="ENABLED">{t('enabled')}</option>
                <option value="DISABLED">{t('disabled')}</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandPersonalInfo(prev => !prev)}
              className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              {expandPersonalInfo ? t('collapsePersonalInfo') : t('expandPersonalInfo')}
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 shadow-sm disabled:shadow-none"
            >
              {t('addUser')}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{t('personalInfoHint')}</p>
        {expandPersonalInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-gray-200 mt-3">
            {PROFILE_FIELD_DEFS.map(f => (
              <div key={f.key}>
                <label className="block mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {(t as any)(f.tKey)}
                </label>
                {f.type === 'number' ? (
                  <ZeroFriendlyNumberInput
                    value={newProfile[f.key] as number}
                    onChange={(value) => setNewProfile((p: any) => ({
                      ...p,
                      [f.key]: value,
                    }))}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
                  />
                ) : (
                  <input
                    type={f.type || 'text'}
                    value={(newProfile[f.key] ?? '') as string | number}
                    onChange={(e) => setNewProfile((p: any) => ({
                      ...p,
                      [f.key]: e.target.value || null,
                    }))}
                    placeholder={f.key === 'contactPhone' ? t('whatsappPhonePlaceholder') : undefined}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
                  />
                )}
                {f.key === 'contactPhone' ? (
                  <p className="mt-1 text-[11px] text-gray-500">{t('whatsappPhoneHint')}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 用户列表 */}
      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-gray-200 transition-colors">
            <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-gray-900 text-lg">{user.roleName}</span>
                  {user.isAdmin && (
                    <span className="inline-block px-2.5 py-1 bg-[#007AFF]/10 text-[#007AFF] text-xs font-semibold rounded-md">
                      {t('admin')}
                    </span>
                  )}
                  {user.emailVerified ? (
                    <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-md border border-emerald-200">
                      {t('emailVerified')}
                    </span>
                  ) : user.email ? (
                    <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 text-[11px] font-medium rounded-md border border-amber-200">
                      {t('emailNotVerified')}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-500 break-all">{user.email || '—'}</div>
                {(user.profile?.contactPhone || user.whatsappBindings?.[0]?.phoneE164) ? (
                  <div className="mt-1 text-xs text-gray-600">
                    {t('whatsappPhone')}: +
                    {user.profile?.contactPhone || user.whatsappBindings?.[0]?.phoneE164}
                    {user.whatsappBindings?.[0]?.phoneE164 ? (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                        WhatsApp
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-amber-600">{t('whatsappPhoneMissing')}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(user)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-semibold rounded-lg hover:bg-indigo-100"
                >
                  {t('editUserProfile')}
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-500">{t('dedicatedPool')}</span>
              <label className="flex items-center cursor-pointer relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={!!user.poolEnabled}
                  onChange={(e) => handleTogglePool(user.id, e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#34C759]"></div>
              </label>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-500">{t('publicLedgerPermission')}</span>
              <select
                value={user.isAdmin ? 'MEMBER' : (user.publicLedgerRole || 'NONE')}
                onChange={(e) => handleUpdatePublicLedgerRole(user.id, e.target.value as 'NONE' | 'MEMBER')}
                disabled={user.isAdmin || savingUserId === user.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none disabled:bg-gray-100"
              >
                <option value="NONE">{t('denyPublicLedger')}</option>
                <option value="MEMBER">{t('allowPublicLedger')}</option>
              </select>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-500">{t('ocrPermission')}</span>
              <select
                value={user.ocrEnabled === false ? 'DISABLED' : 'ENABLED'}
                onChange={(e) => handleUpdateOcrPermission(user.id, e.target.value === 'ENABLED')}
                disabled={savingUserId === user.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none disabled:bg-gray-100"
              >
                <option value="ENABLED">{t('enabled')}</option>
                <option value="DISABLED">{t('disabled')}</option>
              </select>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">{t('noUserData')}</p>
        )}
      </div>

      {/* 編輯 Modal */}
      {editingUser && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-6 md:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{t('adminProfileEditTitle')}</h3>
              <button
                onClick={closeEditModal}
                className="px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 text-sm font-medium"
              >{t('cancel')}</button>
            </div>

            <div className="rounded-2xl bg-[#F2F2F7] p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">{t('account')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('email')}</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder={t('emailPlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('roleName')}</label>
                  <input
                    type="text"
                    value={editForm.roleName}
                    onChange={(e) => setEditForm({ ...editForm, roleName: e.target.value })}
                    placeholder={t('roleNamePlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('newPassword')}</label>
                  <input
                    type="password"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                    placeholder={t('newPassword')}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('newPasswordConfirm')}</label>
                  <input
                    type="password"
                    value={editForm.confirmPassword}
                    onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                    placeholder={t('newPasswordConfirm')}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">* 密碼兩格都留空 = 維持原本密碼不變</p>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">{t('personalInfo') || t('personalProfile') || '個人資料'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {PROFILE_FIELD_DEFS.map(f => (
                  <div key={f.key}>
                    <label className="block mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {(t as any)(f.tKey)}
                    </label>
                    {f.type === 'number' ? (
                      <ZeroFriendlyNumberInput
                        value={editProfile[f.key] as number}
                        onChange={(value) => setEditProfile((p: any) => ({
                          ...p,
                          [f.key]: value,
                        }))}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                      />
                    ) : (
                      <input
                        type={f.type || 'text'}
                        value={(editProfile[f.key] ?? '') as string | number}
                        onChange={(e) => setEditProfile((p: any) => ({
                          ...p,
                          [f.key]: e.target.value || null,
                        }))}
                        placeholder={f.key === 'contactPhone' ? t('whatsappPhonePlaceholder') : undefined}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                      />
                    )}
                    {f.key === 'contactPhone' ? (
                      <p className="mt-1 text-[11px] text-gray-500">{t('whatsappPhoneHint')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={closeEditModal}
                className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
              >{t('cancel')}</button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 shadow-sm disabled:shadow-none"
              >
                {savingEdit ? t('saving') || 'Saving...' : t('saveProfile')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AISettingsTab({ initialSettings, locale }: { initialSettings: AISettings; locale: Locale }) {
  const t = createTranslator(locale);
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [model, setModel] = useState(initialSettings.model);
  const [systemPrompt, setSystemPrompt] = useState(initialSettings.systemPrompt);
  const [userPrompt, setUserPrompt] = useState(initialSettings.userPrompt);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await updateAISettings({
      enabled,
      model,
      systemPrompt,
      userPrompt,
    });
    if (!res.success) {
      alert(res.error);
      setSaving(false);
      return;
    }
    alert(t('aiSettingsSaved'));
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{t('aiSettings')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('aiSettingsHint')}</p>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <div className="rounded-2xl bg-[#F2F2F7] p-4">
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
            <span>{t('ocrGlobalEnabled')}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded text-[#007AFF] focus:ring-[#007AFF]"
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">{t('ocrPermissionHint')}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('ocrModel')}</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/30"
            placeholder="gpt-4.1-mini"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('ocrSystemPrompt')}</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/30"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('ocrUserPrompt')}</label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/30"
          />
          <p className="mt-2 text-xs text-gray-500">{t('ocrPromptVariableHint')}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#007AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0066CC] disabled:opacity-50"
        >
          {saving ? t('saving') : t('saveAiSettings')}
        </button>
      </div>
    </div>
  );
}

function PluginsTab({ initialFlags, locale }: { initialFlags: PluginFlags; locale: Locale }) {
  const t = createTranslator(locale);
  const [flags, setFlags] = useState<PluginFlags>(initialFlags);
  const [saving, setSaving] = useState(false);

  const toggle = (key: keyof PluginFlags) => {
    setFlags((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await updatePluginFlags(flags);
    if (!res.success) {
      alert(res.error);
      setSaving(false);
      return;
    }
    alert(t('pluginsSaved'));
    setSaving(false);
  };

  const rows: Array<{ key: keyof PluginFlags; label: string }> = [
    { key: 'matters', label: t('pluginMatters') },
    { key: 'contracts', label: t('pluginContracts') },
    { key: 'payroll', label: t('pluginPayroll') },
    { key: 'recurring', label: t('pluginRecurring') },
  ];

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{t('plugins')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('pluginsHint')}</p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <label
            key={row.key}
            className="flex items-center justify-between gap-3 rounded-2xl bg-[#F2F2F7] p-4 text-sm font-medium text-gray-700"
          >
            <span>{row.label}</span>
            <input
              type="checkbox"
              checked={flags[row.key]}
              onChange={() => toggle(row.key)}
              className="h-4 w-4 rounded text-[#007AFF] focus:ring-[#007AFF]"
            />
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#007AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0066CC] disabled:opacity-50"
        >
          {saving ? t('saving') : t('savePlugins')}
        </button>
      </div>
    </div>
  );
}

// ---------------- WhatsApp 綁定 ----------------
function WhatsAppTab({
  initialBindings,
  users,
  locale,
}: {
  initialBindings: WhatsAppBindingRow[]
  users: any[]
  locale: Locale
}) {
  const t = createTranslator(locale);
  const [bindings, setBindings] = useState(initialBindings);
  const [userId, setUserId] = useState(users[0]?.id || '');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const rows = await listWhatsAppBindings();
    setBindings(rows as WhatsAppBindingRow[]);
  };

  const handleBind = async () => {
    if (!userId || !phone.trim()) return;
    setLoading(true);
    setMessage('');
    const res = await upsertWhatsAppBinding(userId, phone.trim(), true);
    setLoading(false);
    if (res.success) {
      setPhone('');
      setMessage(t('whatsappBindOk'));
      await refresh();
    } else {
      setMessage(res.error || t('whatsappBindFail'));
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm(t('whatsappUnbind') + '?')) return;
    setLoading(true);
    await removeWhatsAppBinding(id);
    setLoading(false);
    await refresh();
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{t('whatsapp')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('whatsappHint')}</p>
      </div>

      <div className="space-y-3 rounded-2xl bg-[#F2F2F7] p-4">
        <label className="block text-sm font-medium text-gray-700">
          {t('whatsappSelectUser')}
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.roleName} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t('whatsappPhone')}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('whatsappPhonePlaceholder')}
            className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={handleBind}
          disabled={loading || !userId}
          className="rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('whatsappBind')}
        </button>
        {message ? <p className="text-sm text-gray-600">{message}</p> : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">{t('whatsappBound')}</h3>
        {bindings.length === 0 ? (
          <p className="text-sm text-gray-500">{t('whatsappEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {bindings.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-gray-900">+{b.phoneE164}</div>
                  <div className="text-gray-500">
                    {b.user.roleName} · {b.user.email}
                    {!b.enabled ? ' · OFF' : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(b.id)}
                  disabled={loading}
                  className="text-[#FF3B30] font-semibold disabled:opacity-50"
                >
                  {t('whatsappUnbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
