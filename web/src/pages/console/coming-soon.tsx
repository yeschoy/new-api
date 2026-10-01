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

import type { ConsoleSection } from './console-layout'
import { ConsolePage } from './console-page'
import { Panel } from './console-ui'

/** Stand-in for a page still being brought over from the old console. */
export function ComingSoon(props: { active: ConsoleSection; title: string; role?: number }) {
  const { t } = useI18n()
  return (
    <ConsolePage active={props.active} title={t(props.title)} role={props.role}>
      <Panel>
        <p className='text-or-muted text-[14px]'>{t('这个页面正在从旧网站搬过来，很快就好。')}</p>
      </Panel>
    </ConsolePage>
  )
}
