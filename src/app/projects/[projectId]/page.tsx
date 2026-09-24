import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '../../actions/auth'
import { getPluginFlags } from '../../actions/settings'
import { getCurrentLocale } from '@/lib/locale'
import { isProjectTempAccount } from '@/lib/access'
import {
  getProjectDetail,
  getProjectReminderItems,
  getProjectTempAccountCandidates,
} from '../../actions/project'
import ProjectDetailClient from '../ProjectDetailClient'

export const metadata = {
  title: 'Project',
}

function toClientJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    String((error as { digest: string }).digest).startsWith('NEXT_REDIRECT')
  )
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const flags = await getPluginFlags()
  if (!flags.projects) {
    redirect(isProjectTempAccount(session) ? '/login' : '/')
  }

  const { projectId: rawId } = await params
  const projectId = String(rawId || '').trim()
  if (!projectId) notFound()

  let project = null
  try {
    project = await getProjectDetail(projectId)
  } catch (error) {
    // Don't swallow Next.js navigation signals; don't bounce back to /projects
    // on load failures (that looks like "click did nothing" on soft navigation).
    if (isNextRedirectError(error)) throw error
    console.error('[project detail]', projectId, error)
    notFound()
  }
  if (!project) notFound()

  const [tempCandidates, allReminders] = await Promise.all([
    project.canManageTempAccess
      ? getProjectTempAccountCandidates(projectId)
      : Promise.resolve([]),
    getProjectReminderItems(),
  ])

  const projectReminders = allReminders.filter((item) => {
    if (item.projectId) return item.projectId === projectId
    return item.href.startsWith(`/projects/${projectId}`)
  })

  // Ensure arrays exist so the client tree never crashes on .map/.filter.
  const safeProject = {
    ...project,
    members: Array.isArray(project.members) ? project.members : [],
    tasks: Array.isArray(project.tasks) ? project.tasks : [],
    sections: Array.isArray(project.sections) ? project.sections : [],
    ledger: Array.isArray(project.ledger) ? project.ledger : [],
    memos: Array.isArray(project.memos) ? project.memos : [],
    sectionAccesses: Array.isArray(project.sectionAccesses) ? project.sectionAccesses : [],
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <Suspense fallback={<div className="p-6 text-sm text-gray-400">…</div>}>
        <ProjectDetailClient
          locale={await getCurrentLocale()}
          currentUserId={session.userId}
          isAdmin={session.isAdmin}
          project={toClientJSON(safeProject)}
          tempAccountCandidates={toClientJSON(tempCandidates)}
          reminders={toClientJSON(projectReminders)}
        />
      </Suspense>
    </div>
  )
}
