'use client'

import { useRouter } from 'next/navigation'
import { logout } from './actions/auth'

export default function GlobalHeader({ session }: { session: any }) {
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  if (!session) return null

  return (
    <div className="bg-[#1C1C1E] text-white text-xs py-2 px-4 flex justify-between items-center z-50 relative">
      <div className="flex items-center gap-2 max-w-5xl mx-auto w-full justify-between">
        <div className="flex items-center gap-2">
          <span className="opacity-70">当前角色:</span>
          <span className="font-semibold">{session.roleName}</span>
        </div>
        <button 
          onClick={handleLogout}
          className="opacity-80 hover:opacity-100 font-medium transition-opacity flex items-center gap-1"
        >
          登出
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    </div>
  )
}