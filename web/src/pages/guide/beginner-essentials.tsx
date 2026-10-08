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
import { Check, Copy, KeyRound, Link2, Puzzle, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { defaultModel } from '@/lib/pinned-models'
import { useCatalog } from '@/lib/queries'

import type { GuideAddress } from './guide-address'
import { useCopy } from './guide-code'

function Essential(props: { icon: LucideIcon; title: string; subtitle: string; value: string; note: string; copyable?: boolean }) {
  const { t } = useI18n()
  const { copied, copy } = useCopy()
  const done = copied === props.value
  return (
    <div className='border-or-line bg-or-card flex min-w-0 flex-col gap-3 rounded-[8px] border p-5'>
      <div className='flex items-center gap-3'>
        <span className='bg-or-primary-soft text-or-primary flex size-10 shrink-0 items-center justify-center rounded-[10px]'>
          <props.icon className='size-5' aria-hidden='true' />
        </span>
        <div className='min-w-0'>
          <h3 className='text-[15px] font-semibold'>{props.title}</h3>
          <p className='text-or-muted text-[12px] leading-5'>{props.subtitle}</p>
        </div>
      </div>
      <div className='border-or-line bg-or-fill flex min-w-0 items-center gap-2 rounded-[6px] border py-1.5 pr-1.5 pl-3'>
        <code className='font-geist min-w-0 flex-1 truncate text-[12.5px]'>{props.value}</code>
        {props.copyable ? (
          <button
            type='button'
            aria-label={t('复制{label}', { label: props.title })}
            title={t('复制{label}', { label: props.title })}
            onClick={() => copy(props.value)}
            className='text-or-muted hover:bg-or-bg hover:text-or-fg flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors'
          >
            {done ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
          </button>
        ) : null}
      </div>
      <p className='text-or-muted text-[12px] leading-5'>{props.note}</p>
    </div>
  )
}

/** The address, key and model every tool asks for: this site's address, a masked key and one of this site's models. */
export function Essentials(props: { address: GuideAddress }) {
  const { t } = useI18n()
  const { models } = useCatalog()
  const model = defaultModel(models) || '—'
  return (
    <section id='essentials' aria-labelledby='essentials-title' className='scroll-mt-20 xl:scroll-mt-[102px]'>
      <h2 id='essentials-title' className='text-[24px] leading-8 font-bold tracking-[-0.4px]'>
        {t('所有工具都会问的三样东西')}
      </h2>
      <p className='text-or-muted mt-2 text-[15px] leading-6'>
        {t('所有工具都只会问你三样东西。在下方获取它们，选好工具照着步骤做——大约三分钟搞定。')}
      </p>
      <div className='mt-6 grid gap-4 md:grid-cols-3'>
        <Essential
          icon={Link2}
          title={t('接口地址')}
          subtitle={t('当工具要求填写 Base URL / API 地址时，填这个')}
          value={props.address.baseUrl}
          note={t('有些工具需要不带 /v1 的地址，有些需要以 /chat/completions 结尾的完整路径——下方每张工具卡片都会告诉你该用哪种。')}
          copyable
        />
        <Essential
          icon={KeyRound}
          title={t('API 密钥|字段')}
          subtitle={t('以 sk- 开头的密码，在本站创建')}
          value='sk-****************'
          note={t('在「API 密钥」页面创建，创建后立即复制并妥善保管。')}
        />
        <Essential
          icon={Puzzle}
          title={t('模型 ID')}
          subtitle={t('你想对话的模型的准确名称')}
          value={model}
          note={t('请从模型列表复制完整的模型 ID，一个字母不对就会提示“找不到模型”。')}
        />
      </div>
      <Link
        to='/settings/keys'
        className='bg-or-primary text-or-bg mt-6 inline-flex h-9 items-center gap-2 rounded-[6px] px-4 text-[14px] font-medium transition-opacity hover:opacity-90'
      >
        <KeyRound className='size-4' aria-hidden='true' />
        {t('创建我的密钥')}
      </Link>
    </section>
  )
}
