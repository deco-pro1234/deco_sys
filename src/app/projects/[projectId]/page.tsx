import { redirect } from 'next/navigation'
import { getSession } from '../../actions/auth'
import { getPluginFlags } from '../../actions/settings'
import { getCurrentLocale } from '@/lib/locale'
import { isProjectTempAccount } from '@/lib/access'
import {
  getProjectDetail,
  getProjectTempAccountCandidates,
} from '../../actions/project'
import ProjectDetailClient from '../ProjectDetailClient'

export const metadata = {
  title: 'Project',
}

function toClientJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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

  const { projectId } = await params
  const locale = await getCurrentLocale()

  let project = null
  try {
    project = await getProjectDetail(projectId)
  } catch {
    redirect('/projects')
  }
  if (!project) redirect('/projects')

  const tempCandidates = project.canManageTempAccess
    ? await getProjectTempAccountCandidates(projectId)
    : []

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <ProjectDetailClient
        locale={locale}
        currentUserId={session.userId}
        isAdmin={session.isAdmin}
        project={toClientJSON(project)}
        tempAccountCandidates={toClientJSON(tempCandidates)}
      />
    </div>
  )
}
