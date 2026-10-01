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
import { useI18n } from '@/i18n/i18n'
import { RouterShell } from '@/sites/router/router-shell'

/** Stand-in for a public page still being brought over from the old site. */
export function PublicComingSoon(props: { title: string }) {
  const { t } = useI18n()
  return (
    <RouterShell>
      <div className='mx-auto flex max-w-[640px] flex-col items-center px-6 py-32 text-center'>
        <h1 className='text-[28px] font-semibold tracking-[-0.01em]'>{t(props.title)}</h1>
        <p className='text-or-muted mt-3 text-[15px]'>{t('这个页面正在从旧网站搬过来，很快就好。')}</p>
      </div>
    </RouterShell>
  )
}
