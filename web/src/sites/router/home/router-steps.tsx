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
import { CreditCard, KeyRound, Mail, MessageCircle, User } from 'lucide-react'
import { Link } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { ProviderIcon } from '@/components/provider-icon'

const bar = 'bg-or-fg/15 h-1 rounded-full'

function StepHead(props: { index: number; title: string }) {
  return (
    <div className='flex items-center gap-3'>
      <span className='bg-or-fill flex size-8 items-center justify-center rounded-full text-[14px] font-medium'>
        {props.index}
      </span>
      <h3 className='text-[16px] leading-[21.6px] font-medium'>{props.title}</h3>
    </div>
  )
}

/** Three columns (≈253px) under a 856px wrapper, 48px apart. */
export function RouterSteps() {
  const { t } = useI18n()
  return (
    <section className='mx-auto mt-24 grid max-w-[856px] gap-12 px-6 md:grid-cols-3 md:px-0'>
      <div>
        <StepHead index={1} title={t('注册')} />
        <p className='text-or-muted mt-4 text-[14px] leading-[22.75px]'>
          {t('创建账号即可开始，之后也可以为团队单独开组织。')}
        </p>
        <div className='mt-6 flex items-center gap-2' aria-hidden='true'>
          <User className='text-or-muted size-4' />
          <span className={`${bar} w-12`} />
        </div>
        <div className='mt-3 flex gap-2'>
          {[
            <Mail key='mail' className='size-4' />,
            <ProviderIcon key='github' name='Github' size={16} />,
            <MessageCircle key='chat' className='size-4' />,
          ].map((icon) => (
            <Link
              key={icon.key}
              to='/sign-up'
              aria-label={t('注册')}
              className='border-or-line bg-or-fill hover:border-or-fg/20 flex size-8 items-center justify-center rounded-[6px] border'
            >
              {icon}
            </Link>
          ))}
        </div>
      </div>
      <div>
        <StepHead index={2} title={t('充值额度')} />
        <p className='text-or-muted mt-4 text-[14px] leading-[22.75px]'>
          {t('额度可用于任意模型和任意渠道。')}
        </p>
        <div className='mt-6 flex items-center gap-2' aria-hidden='true'>
          <CreditCard className='text-or-muted size-4' />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`${bar} w-6`} />
          ))}
        </div>
        <div className='mt-3 flex flex-col gap-1.5' aria-hidden='true'>
          {[
            [t('9月1日'), '¥99'],
            [t('8月30日'), '¥10'],
          ].map(([date, amount]) => (
            <div key={amount} className='bg-or-fill flex items-center gap-3 rounded-[4px] px-2 py-1 text-[11px]'>
              <span className='text-or-muted w-12'>{date}</span>
              <span className={`${bar} flex-1`} />
              <span className='font-medium'>{amount}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <StepHead index={3} title={t('获取 API Key')} />
        <p className='text-or-muted mt-4 text-[14px] leading-[22.75px]'>
          {t('创建密钥即可发起请求，')}
          <span className='text-or-fg underline underline-offset-2'>{t('完全兼容 OpenAI')}</span>
          {t('。')}
        </p>
        <div className='mt-6 flex items-center gap-2' aria-hidden='true'>
          <KeyRound className='text-or-muted size-4' />
          <span className='border-or-line bg-or-fill rounded-[4px] border px-2 py-0.5 font-geist text-[11px]'>
            API_KEY
          </span>
        </div>
        <div className='bg-or-fill mt-3 rounded-[4px] px-2 py-1 font-geist text-[11px] tracking-widest' aria-hidden='true'>
          ••••••••••••••••
        </div>
      </div>
    </section>
  )
}
