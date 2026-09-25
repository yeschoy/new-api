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
import { Link } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { RouterShell } from '@/sites/router/router-shell'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <RouterShell>
      <div className='flex flex-col items-center px-6 py-32 text-center'>
        <div className='text-[56px] font-bold tracking-[-1.4px]'>404</div>
        <p className='text-or-muted mt-2 text-[16px]'>{t('页面不存在')}</p>
        <Link to='/' className='bg-or-primary text-or-bg mt-8 flex h-11 items-center rounded-[6px] px-8 text-[14px] font-medium'>
          {t('返回首页')}
        </Link>
      </div>
    </RouterShell>
  )
}
