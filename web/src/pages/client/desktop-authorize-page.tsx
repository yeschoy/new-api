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
import { Check, KeyRound, Loader2, ShieldCheck, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { RequireAuth } from '@/components/require-auth'
import { useI18n } from '@/i18n/i18n'
import { useBrand } from '@/lib/queries'
import { RouterShell } from '@/sites/router/router-shell'

import {
  decideDesktopAuthorization,
  normalizeUserCode,
  type AuthorizationDecision,
  type DecisionOutcome,
} from './desktop-authorize-api'
import { Outcome, Permission, Problem } from './desktop-authorize-parts'

function ProblemFor(props: { code: string; outcome: DecisionOutcome | null }) {
  const { t } = useI18n()
  if (!props.code) return <Problem title={t('缺少连接验证码')} text={t('请从桌面助手重新打开此页面。')} />
  if (props.outcome === 'expired') return <Problem title={t('这次连接请求已经过期')} text={t('请回到桌面助手，重新发起连接。')} />
  if (props.outcome === 'error') return <Problem title={t('暂时无法确认连接')} text={t('请检查网络后重试，目前没有授予任何访问权限。')} />
  return null
}

/** The question the desktop app asks through its link, answered by the signed-in visitor. */
function Authorization(props: { code: string }) {
  const { t } = useI18n()
  const brand = useBrand()
  const [pending, setPending] = useState<AuthorizationDecision | null>(null)
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null)
  const locked = !props.code || pending !== null

  const decide = async (decision: AuthorizationDecision) => {
    if (locked) return
    setPending(decision)
    const result = await decideDesktopAuthorization(props.code, decision)
    setPending(null)
    setOutcome(result)
  }

  let body: React.ReactNode
  if (outcome === 'approved' || outcome === 'denied') {
    body = <Outcome approved={outcome === 'approved'} />
  } else {
    body = (
      <>
        <div>
          <p className='text-[15px] leading-7'>{t('桌面助手正在请求在这台电脑上使用你的{brand}账号。', { brand: brand.name })}</p>
          <p className='text-or-muted mt-1 text-[14px] leading-6'>{t('只有当这个连接由你在官方桌面助手中发起时，才继续操作。')}</p>
        </div>

        <div className='border-or-line bg-or-fill rounded-[8px] border px-5 py-4'>
          <p className='text-or-muted text-[12px] font-medium'>{t('桌面助手显示的验证码')}</p>
          <p className='font-geist mt-2 text-[24px] font-semibold tracking-[0.18em] break-all tabular-nums sm:text-[30px]'>{props.code || '—'}</p>
          <p className='text-or-muted mt-2 text-[12px] leading-5'>{t('连接前，请确认验证码与桌面助手中显示的一致。')}</p>
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          <Permission icon={WalletCards} label={t('查看余额与用量')} />
          <Permission icon={KeyRound} label={t('配置你的 AI 应用')} />
          <Permission icon={ShieldCheck} label={t('创建可随时撤销的登录')} />
        </div>

        <ProblemFor code={props.code} outcome={outcome} />

        <div className='flex flex-col-reverse gap-3 pt-1 sm:flex-row'>
          <button
            type='button'
            disabled={locked}
            onClick={() => void decide('deny')}
            className='border-or-line bg-or-bg hover:bg-or-fill flex h-11 flex-1 items-center justify-center gap-2 rounded-[6px] border px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          >
            {pending === 'deny' ? <Loader2 className='size-4 animate-spin' aria-hidden='true' /> : null}
            {t('暂不连接')}
          </button>
          <button
            type='button'
            disabled={locked}
            onClick={() => void decide('approve')}
            className='bg-or-primary text-or-bg flex h-11 flex-1 items-center justify-center gap-2 rounded-[6px] px-4 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {pending === 'approve' ? <Loader2 className='size-4 animate-spin' aria-hidden='true' /> : <Check className='size-4' aria-hidden='true' />}
            {pending === 'approve' ? t('正在连接…') : t('连接这台电脑')}
          </button>
        </div>
      </>
    )
  }

  return (
    <section className='w-full max-w-[620px]' aria-live='polite'>
      <div className='border-or-line bg-or-card overflow-hidden rounded-[12px] border'>
        <header className='border-or-line flex items-center gap-4 border-b px-6 py-5 sm:px-8'>
          <BrandMark size={40} className='shrink-0' />
          <div className='min-w-0'>
            <p className='text-or-muted text-[12px] font-medium'>{t('官方桌面端连接')}</p>
            <h1 className='mt-1 text-[20px] font-semibold tracking-[-0.3px] sm:text-[24px]'>{t('连接{brand}桌面助手', { brand: brand.name })}</h1>
          </div>
        </header>
        <div className='flex flex-col gap-7 px-6 py-7 sm:px-8 sm:py-8'>{body}</div>
      </div>
      <p className='text-or-muted mt-4 text-center text-[12px] leading-5'>
        {t('此次授权允许桌面助手读取和管理你的 API 密钥，但不会透露你的密码。')}
      </p>
    </section>
  )
}

/** Opened by the desktop app with ?user_code=…; signed-out visitors sign in first and come back here. */
export function DesktopAuthorizePage() {
  const [params] = useSearchParams()
  const code = normalizeUserCode(params.get('user_code'))
  return (
    <RouterShell footer={false}>
      <RequireAuth>
        <div className='flex justify-center px-6 py-12 md:py-16'>
          <Authorization code={code} />
        </div>
      </RequireAuth>
    </RouterShell>
  )
}
