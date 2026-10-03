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
import { BookOpen, CircleAlert, RotateCw } from 'lucide-react'
import { useId } from 'react'
import { Link, useLocation } from 'react-router'

import { Select, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import type { GuideEnvironment } from './use-guide-environment'

const FRAME = 'border-or-line bg-or-card rounded-[8px] border'

function BaseUrl(props: { value: string }) {
  const { t } = useI18n()
  return (
    <div className='min-w-0'>
      <span className='text-or-muted text-[12px] font-medium'>{t('API 地址')}</span>
      <code className='bg-or-fill font-geist mt-1.5 block truncate rounded-[6px] px-2.5 py-2 text-[12.5px]'>{props.value}</code>
    </div>
  )
}

function Choices(props: { environment: GuideEnvironment; baseUrl: string }) {
  const { t } = useI18n()
  const modelId = useId()
  const groupId = useId()
  const env = props.environment
  return (
    <div className='mt-4 grid min-w-0 gap-4 sm:grid-cols-3'>
      <BaseUrl value={props.baseUrl} />
      <div className='flex min-w-0 flex-col gap-1.5'>
        <label htmlFor={modelId} className='text-or-muted text-[12px] font-medium'>
          {t('模型|字段')}
        </label>
        <Select id={modelId} value={env.model} onChange={env.setModel} options={env.models.map((model) => ({ value: model, label: model }))} />
      </div>
      <div className='flex min-w-0 flex-col gap-1.5'>
        <label htmlFor={groupId} className='text-or-muted text-[12px] font-medium'>
          {t('分组')}
        </label>
        <Select id={groupId} value={env.group} onChange={env.setGroup} options={env.groups} />
      </div>
    </div>
  )
}

/**
 * The model, group and address the examples use. Signed-in readers pick from
 * what their account can call; signed-out readers are invited to sign in.
 */
export function EnvironmentPanel(props: { environment: GuideEnvironment; baseUrl: string }) {
  const { t } = useI18n()
  const location = useLocation()
  const env = props.environment

  if (env.status === 'loading') {
    return (
      <section aria-label={t('当前配置')} aria-busy='true' className={`${FRAME} grid gap-3 p-4 sm:grid-cols-3`}>
        {[0, 1, 2].map((index) => (
          <div key={index} className='bg-or-fill h-14 animate-pulse rounded-[6px]' />
        ))}
      </section>
    )
  }

  if (env.status === 'error') {
    return (
      <div role='alert' className='border-or-red/30 bg-or-red/10 flex flex-wrap items-start gap-3 rounded-[8px] border p-4'>
        <CircleAlert className='text-or-red mt-0.5 size-4 shrink-0' aria-hidden='true' />
        <div className='min-w-0 flex-1'>
          <p className='text-[14px] font-medium'>{t('无法验证当前配置')}</p>
          <p className='text-or-muted mt-1 text-[13px] leading-5'>{t('请先重试再复制配置，以确保模型和分组信息准确。')}</p>
        </div>
        <button
          type='button'
          onClick={env.retry}
          className='hover:bg-or-fill flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-colors'
        >
          <RotateCw className='size-3.5' aria-hidden='true' />
          {t('重试')}
        </button>
      </div>
    )
  }

  if (env.status === 'empty') {
    return (
      <section aria-label={t('当前配置')} className={`${FRAME} flex flex-col items-center px-6 py-8 text-center`}>
        <span className='bg-or-fill flex size-10 items-center justify-center rounded-full'>
          <BookOpen className='text-or-muted size-4' aria-hidden='true' />
        </span>
        <h2 className='mt-3 text-[15px] font-semibold'>{t('没有可用的兼容模型')}</h2>
        <p className='text-or-muted mt-1 max-w-[420px] text-[13px] leading-5'>{t('当前账户没有启用此文章所需协议的模型。')}</p>
        <Link to='/' className='border-or-line bg-or-bg hover:bg-or-fill mt-4 flex h-8 items-center rounded-[6px] border px-3 text-[13px] font-medium'>
          {t('查看模型')}
        </Link>
      </section>
    )
  }

  const signedOut = env.status === 'signed-out'
  const groupLabel = env.groups.find((group) => group.value === env.group)?.label ?? env.group
  return (
    <section aria-label={t('当前配置')} className={`${FRAME} p-4`}>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-[14px] font-semibold'>{t('当前配置')}</h2>
          <p className='text-or-muted mt-1 text-[13px] leading-5'>
            {signedOut ? t('登录后，示例会自动填入你的账户可用的模型和分组。') : t('切换模型或分组后，示例会自动更新。')}
          </p>
        </div>
        {signedOut ? (
          <Link
            to={`/sign-in?redirect=${encodeURIComponent(location.pathname + location.search)}`}
            className='bg-or-primary text-or-bg flex h-8 items-center rounded-[6px] px-3 text-[13px] font-medium transition-opacity hover:opacity-90'
          >
            {t('登录')}
          </Link>
        ) : (
          <div className='flex min-w-0 flex-wrap gap-1.5'>
            <Tag>{env.model}</Tag>
            <Tag tone='success'>{groupLabel}</Tag>
          </div>
        )}
      </div>
      {signedOut ? (
        <div className='mt-4'>
          <BaseUrl value={props.baseUrl} />
        </div>
      ) : (
        <Choices environment={env} baseUrl={props.baseUrl} />
      )}
    </section>
  )
}
