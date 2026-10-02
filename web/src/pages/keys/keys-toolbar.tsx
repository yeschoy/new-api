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
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Select, TextInput } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'

const STATUS_OPTIONS = [
  { value: '', label: tk('全部状态') },
  { value: '1', label: tk('已启用') },
  { value: '2', label: tk('已禁用') },
  { value: '3', label: tk('已过期') },
  { value: '4', label: tk('已耗尽') },
]

/** Typing pauses this long before the server is asked. */
const SEARCH_DELAY_MS = 500

export type SearchTerms = { keyword: string; token: string }

function SearchBox(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <span className='relative block min-w-0 flex-1 sm:max-w-[220px]'>
      <Search className='text-or-dim pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' aria-hidden='true' />
      <TextInput type='search' value={props.value} onChange={props.onChange} placeholder={props.label} ariaLabel={props.label} className='pl-9' />
    </span>
  )
}

/**
 * Name and key search (sent once typing pauses) and the status filter, which
 * like on the old page narrows the keys of the current page.
 */
export function KeysToolbar(props: { status: string; onStatus: (status: string) => void; onSearch: (terms: SearchTerms) => void }) {
  const { t } = useI18n()
  const [keyword, setKeyword] = useState('')
  const [token, setToken] = useState('')
  const onSearch = props.onSearch

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch({ keyword: keyword.trim(), token: token.trim() }), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [keyword, token, onSearch])

  return (
    <div className='mb-3 flex flex-wrap items-center gap-2'>
      <SearchBox label={t('搜索名称')} value={keyword} onChange={setKeyword} />
      <SearchBox label={t('搜索密钥')} value={token} onChange={setToken} />
      <Select
        ariaLabel={t('状态')}
        value={props.status}
        onChange={props.onStatus}
        options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
        className='w-full sm:w-[140px]'
      />
    </div>
  )
}
