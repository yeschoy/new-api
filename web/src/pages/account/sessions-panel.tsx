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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Smartphone } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ConfirmButton, Panel, Tag, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { authStore } from '@/lib/auth-store'
import { dateTime } from '@/lib/format'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { listSessions, revokeOtherSessions, revokeSession, type DeviceSession } from './account-api'
import { deviceName, loginMethodLabel, relativeTime } from './account-format'

/** Devices signed in to this account (GET /api/user/sessions); sign one or all others out. */
export function SessionsPanel() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const key = useConsoleKey('sessions')
  const sessions = useQuery({ queryKey: key, queryFn: listSessions })
  const list = sessions.data ?? []
  const others = list.some((session) => !session.current)

  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: async () => {
      toast.success(t('已退出其他设备'))
      await queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (err) => toast.error(errorMessage(err, t('操作失败'))),
  })

  const revoke = useMutation({
    mutationFn: async (session: DeviceSession) => {
      await revokeSession(session.sid)
      return session
    },
    onSuccess: async (session) => {
      if (session.current) {
        authStore.clear()
        queryClient.removeQueries({ queryKey: ['console'] })
        navigate('/sign-in', { replace: true })
        return
      }
      toast.success(t('已移除'))
      await queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (err) => toast.error(errorMessage(err, t('操作失败'))),
  })

  let body: React.ReactNode = <Message>{t('加载中…')}</Message>
  if (sessions.isError) body = <Message>{errorMessage(sessions.error, t('获取登录设备失败'))}</Message>
  else if (sessions.isSuccess && list.length === 0) body = <Message>{t('暂无登录设备')}</Message>
  else if (sessions.isSuccess) {
    body = list.map((session) => (
      <SessionRow key={session.sid} session={session} busy={revoke.isPending && revoke.variables?.sid === session.sid} onRevoke={() => revoke.mutate(session)} />
    ))
  }

  return (
    <Panel
      title={t('登录设备')}
      flush
      extra={
        others ? (
          <ConfirmButton question={t('其他设备将立即退出，确认？')} busy={revokeOthers.isPending} onConfirm={() => revokeOthers.mutate()}>
            {t('退出其他设备')}
          </ConfirmButton>
        ) : null
      }
    >
      {body}
    </Panel>
  )
}

function Message(props: { children: React.ReactNode }) {
  return <p className='text-or-muted px-5 py-6 text-center text-[14px]'>{props.children}</p>
}

function SessionRow(props: { session: DeviceSession; busy: boolean; onRevoke: () => void }) {
  const { t } = useI18n()
  const session = props.session
  // Only this browser can tell an iPad from a Mac by its touch points.
  const name = deviceName(session.user_agent, session.current ? navigator.maxTouchPoints : 0)
  const Icon = /iOS|Android/.test(name) ? Smartphone : Monitor
  return (
    <div className='border-or-line flex flex-col gap-3 border-t px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:gap-4'>
      <span className='bg-or-fill flex size-10 shrink-0 items-center justify-center rounded-[8px]'>
        <Icon className='text-or-muted size-5' aria-hidden='true' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2 text-[14px] font-medium'>
          <span>{name}</span>
          {session.current ? <Tag tone='success'>{t('当前设备')}</Tag> : null}
        </div>
        <p className='text-or-muted mt-1 text-[13px] break-all'>
          {t('IP：{ip} · {method}', { ip: session.ip || t('未知'), method: loginMethodLabel(session.login_method) })}
        </p>
        <p className='text-or-dim mt-0.5 text-[12px]'>
          {t('最近活动：{time} · {expires} 过期', { time: relativeTime(session.last_active_at), expires: dateTime(session.expires_at) })}
        </p>
      </div>
      <ConfirmButton question={session.current ? t('确认退出这台设备？') : t('确认移除这台设备？')} busy={props.busy} onConfirm={props.onRevoke}>
        {session.current ? t('退出') : t('移除')}
      </ConfirmButton>
    </div>
  )
}
