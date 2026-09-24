/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Lock } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { useAuth } from '@/lib/auth-store'
import { RouterShell } from '@/sites/router/router-shell'

/** In-page notice for signed-out visitors; never navigates on its own. */
function SignInNotice() {
  const location = useLocation()
  const redirect = encodeURIComponent(location.pathname + location.search)
  return (
    <div className='flex justify-center px-6 pt-16 pb-24'>
      <div className='border-or-line bg-or-card w-full max-w-[400px] rounded-[8px] border px-10 py-8 text-center'>
        <span className='bg-or-fill mx-auto flex size-10 items-center justify-center rounded-full'>
          <Lock className='text-or-muted size-4' aria-hidden='true' />
        </span>
        <h1 className='mt-4 text-[20px] leading-6 font-semibold'>登录后即可使用</h1>
        <p className='text-or-muted mt-2 text-[14px] leading-[22.75px]'>这个页面需要账号。你可以先随便逛逛模型和排行榜。</p>
        <div className='mt-6 flex flex-col gap-2'>
          <Link
            to={`/sign-in?redirect=${redirect}`}
            className='bg-or-primary text-or-bg flex h-10 items-center justify-center rounded-[6px] text-[14px] font-medium transition-opacity hover:opacity-90'
          >
            登录
          </Link>
          <Link
            to={`/sign-up?redirect=${redirect}`}
            className='border-or-line hover:bg-or-fill flex h-10 items-center justify-center rounded-[6px] border text-[14px] font-medium'
          >
            注册
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Renders children only for signed-in visitors. Signed-out visitors stay on
 * the page and see a sign-in notice with links (no automatic redirect).
 * `framed` wraps the notice in the page frame for pages that render their
 * own frame inside the children.
 */
export function RequireAuth(props: { children: React.ReactNode; framed?: boolean }) {
  const auth = useAuth()
  if (auth.status === 'loading') return null
  if (auth.status === 'anonymous') {
    return props.framed ? (
      <RouterShell footer={false}>
        <SignInNotice />
      </RouterShell>
    ) : (
      <SignInNotice />
    )
  }
  return <>{props.children}</>
}
