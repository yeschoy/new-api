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
import { Panel, Table, TableMessage, type Column } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { KeyRow } from '@/pages/console/key-row'

import { KeyCard } from './key-card'
import type { KeyDetail, UserGroup } from './keys-api'
import { PHONE_QUERY, useMediaQuery } from './use-media-query'

const COLUMNS: Column[] = [
  { label: '' },
  { label: tk('名称') },
  { label: tk('密钥') },
  { label: tk('分组') },
  { label: tk('额度上限'), right: true },
  { label: tk('到期') },
  { label: tk('创建时间') },
  { label: tk('操作'), right: true },
]

export type KeysListState = {
  loading: boolean
  error: unknown
  /** The server answered (the list may still be empty). */
  loaded: boolean
  /** Keys on this page before the status filter. */
  pageCount: number
  searching: boolean
}

function ListMessage(props: { state: KeysListState; shown: number; empty: React.ReactNode }) {
  const { t } = useI18n()
  const state = props.state
  if (state.loading) return <>{t('加载中…')}</>
  if (state.error) return <span className='text-or-red'>{errorMessage(state.error, t('密钥加载失败'))}</span>
  if (!state.loaded || props.shown > 0) return null
  if (state.pageCount > 0) return <>{t('当前页没有该状态的密钥。')}</>
  if (!state.searching) return <>{props.empty}</>
  return (
    <div className='flex flex-col items-center gap-1'>
      <span className='text-or-fg'>{t('没有匹配的密钥')}</span>
      <span>{t('按完整名称或完整密钥匹配，可用 % 模糊匹配，例如 %prod%。')}</span>
    </div>
  )
}

function hasMessage(state: KeysListState, shown: number): boolean {
  return state.loading || Boolean(state.error) || (state.loaded && shown === 0)
}

/** The keys as a table, or as cards on phones, with loading / error / empty states. */
export function KeysList(props: {
  items: KeyDetail[]
  state: KeysListState
  groups: Map<string, UserGroup>
  now: number
  empty: React.ReactNode
  selected: ReadonlySet<number>
  onSelect: (id: number, checked: boolean) => void
}) {
  const phone = useMediaQuery(PHONE_QUERY)
  const message = hasMessage(props.state, props.items.length) ? (
    <ListMessage state={props.state} shown={props.items.length} empty={props.empty} />
  ) : null

  if (phone) {
    return (
      <Panel flush>
        {message ? <div className='text-or-muted px-4 py-12 text-center text-[14px]'>{message}</div> : null}
        {props.items.length ? (
          <ul>
            {props.items.map((apiKey) => (
              <KeyCard
                key={apiKey.id}
                apiKey={apiKey}
                groups={props.groups}
                now={props.now}
                selected={props.selected.has(apiKey.id)}
                onSelect={(checked) => props.onSelect(apiKey.id, checked)}
              />
            ))}
          </ul>
        ) : null}
      </Panel>
    )
  }

  return (
    <Panel flush>
      <Table columns={COLUMNS} minWidth={980}>
        {message ? <TableMessage colSpan={COLUMNS.length}>{message}</TableMessage> : null}
        {props.items.map((apiKey) => (
          <KeyRow
            key={apiKey.id}
            apiKey={apiKey}
            groups={props.groups}
            now={props.now}
            selected={props.selected.has(apiKey.id)}
            onSelect={(checked) => props.onSelect(apiKey.id, checked)}
          />
        ))}
      </Table>
    </Panel>
  )
}
