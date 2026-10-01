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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { useI18n } from '@/i18n/i18n'
import { useCatalog } from '@/lib/queries'

/** ⌘K palette: type to filter the catalog; a result, or Enter for the first one, opens that model's page. */
export function RouterSearchDialog(props: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { models } = useCatalog()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!props.open) return
    setQuery('')
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [props.open, props])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? models.filter(
          (m) =>
            m.model_name.toLowerCase().includes(q) ||
            m.vendor.toLowerCase().includes(q)
        )
      : models
    return list.slice(0, 8)
  }, [models, query])

  if (!props.open) return null

  const open = (name?: string) => {
    props.onClose()
    if (name) navigate(`/models/${encodeURIComponent(name)}`)
  }

  return (
    <div
      className='fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh]'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div
        role='dialog'
        aria-label={t('搜索模型')}
        className='border-or-line bg-or-card w-full max-w-[560px] overflow-hidden rounded-[8px] border shadow-2xl'
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            open(results[0]?.model_name)
          }}
          className='border-or-line flex items-center gap-2 border-b px-4'
        >
          <Search className='text-or-muted size-4' aria-hidden='true' />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('搜索模型、厂商…')}
            className='text-or-fg placeholder:text-or-dim h-12 flex-1 bg-transparent text-[14px] outline-none'
          />
        </form>
        <ul className='max-h-[360px] overflow-y-auto p-1.5'>
          {results.map((model) => (
            <li key={model.model_name}>
              <button
                type='button'
                onClick={() => open(model.model_name)}
                className='hover:bg-or-fill flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left'
              >
                <ProviderIcon name={model.vendorIcon} fallback={model.vendor} size={18} />
                <span className='text-or-fg text-[14px]'>
                  {model.vendor}: {model.model_name}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className='text-or-muted px-3 py-6 text-center text-[14px]'>
              {t('没有匹配的模型')}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
