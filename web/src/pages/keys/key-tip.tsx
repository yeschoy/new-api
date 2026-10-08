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
import { BookOpen, Lightbulb } from 'lucide-react'
import { Link } from 'react-router'

import { useI18n } from '@/i18n/i18n'

/** What a key is for, with a link to the guide on putting it into a tool. */
export function KeyTip() {
  const { t } = useI18n()
  return (
    <div className='border-or-line bg-or-card mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] border px-4 py-3'>
      <Lightbulb className='text-or-primary size-4 shrink-0' aria-hidden='true' />
      <p className='min-w-0 flex-1 text-[14px]'>{t('一键复制——这就是你的 AI 工具需要的密码')}</p>
      <Link
        to='/guide'
        className='border-or-line bg-or-bg text-or-fg hover:bg-or-fill inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-[13px] font-medium transition-colors'
      >
        <BookOpen className='size-3.5' aria-hidden='true' />
        {t('怎么使用？')}
      </Link>
    </div>
  )
}
