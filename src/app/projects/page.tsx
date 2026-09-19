import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getPluginFlags } from '../actions/settings'
import { getCurrentLocale } from '@/lib/locale'
import { isProjectTempAccount } from '@/lib/access'
import {
  getProjectMemberCandidates,
  getProjectReminderItems,
  getProjects,
} from '../actions/project'
import ProjectsClient from './ProjectsClient'

export const metadata = {
  title: 'Projects',
}

function toClientJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export default async function ProjectsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const flags = await getPluginFlags()
  if (!flags.projects) {
    redirect(isProjectTempAccount(session) ? '/login' : '/')
  }

  const locale = await getCurrentLocale()
  const projectTemp = isProjectTempAccount(session)
  const [projects, candidates, reminders] = await Promise.all([
    getProjects(),
    session.isAdmin && !projectTemp ? getProjectMemberCandidates() : Promise.resolve([]),
    getProjectReminderItems(),
  ])

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <ProjectsClient
        locale={locale}
        currentUserId={session.userId}
        isAdmin={session.isAdmin}
        isProjectTemp={projectTemp}
        initialProjects={toClientJSON(projects)}
        memberCandidates={toClientJSON(candidates)}
        initialReminders={toClientJSON(reminders)}
      />
    </div>
  )
}
