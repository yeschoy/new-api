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
import { Pager, Select } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

export const PAGE_SIZES = [10, 20, 50, 100]

/** Page size and pages; `children` sits on the left (actions on every key). */
export function KeysFooter(props: {
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  onSize: (size: number) => void
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className='flex flex-wrap items-center justify-between gap-x-3'>
      <div className='mt-4'>{props.children}</div>
      <div className='flex flex-wrap items-center justify-end gap-x-3'>
        {props.total > PAGE_SIZES[0] ? (
          <Select
            ariaLabel={t('每页条数')}
            value={String(props.size)}
            onChange={(value) => props.onSize(Number(value))}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: t('{size} 条/页', { size }) }))}
            className='mt-4 w-[120px]'
          />
        ) : null}
        <Pager page={props.page} size={props.size} total={props.total} onChange={props.onPage} />
      </div>
    </div>
  )
}
