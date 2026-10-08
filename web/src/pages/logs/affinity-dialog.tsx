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
import { useQuery } from '@tanstack/react-query'

import { Modal, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { getAffinityUsage } from './logs-api'
import type { ChannelAffinity } from './log-types'
import { DetailRow } from './logs-ui'

function figure(stats: Record<string, unknown> | undefined, key: string): number {
  const value = Number(stats?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

/** Upstream cache hits of the key a channel-affinity rule pinned a request to (admins). */
export function AffinityDialog(props: { target: ChannelAffinity; onClose: () => void }) {
  const { t } = useI18n()
  const target = props.target
  const ready = !!target.rule_name && !!target.key_fp
  const stats = useQuery({
    queryKey: useConsoleKey('affinity-usage', target.rule_name, target.using_group, target.key_fp),
    queryFn: () => getAffinityUsage(target),
    enabled: ready,
    retry: false,
  })
  const data = stats.data
  const hit = figure(data, 'hit')
  const total = figure(data, 'total')
  const group = String(data?.using_group || target.using_group || target.selected_group || '')
  const tokens: Array<[string, string]> = [
    [t('输入 tokens'), 'prompt_tokens'],
    [t('缓存 tokens'), 'cached_tokens'],
    [t('输出 tokens'), 'completion_tokens'],
    [t('总 tokens'), 'total_tokens'],
  ]

  return (
    <Modal title={t('渠道亲和：上游缓存命中')} onClose={props.onClose}>
      <p className='text-or-muted mb-3 text-[13px]'>{t('命中判定：用量中有缓存 tokens 即视为命中。')}</p>
      {stats.isLoading ? <p className='text-or-muted py-6 text-center text-[14px]'>{t('加载中…')}</p> : null}
      {stats.isError ? <Notice tone='error'>{errorMessage(stats.error, t('请求失败'))}</Notice> : null}
      {!ready ? <p className='text-or-muted py-6 text-center text-[14px]'>{t('暂无数据')}</p> : null}
      {data ? (
        <div>
          <DetailRow label={t('规则')}>{String(data.rule_name || target.rule_name || '—')}</DetailRow>
          {group ? <DetailRow label={t('分组')}>{group}</DetailRow> : null}
          {target.key_hint ? <DetailRow label={t('密钥摘要')} mono>{target.key_hint}</DetailRow> : null}
          <DetailRow label={t('密钥指纹')} mono>{String(data.key_fp || target.key_fp || '—')}</DetailRow>
          {figure(data, 'window_seconds') > 0 ? <DetailRow label={t('有效期（秒）')}>{figure(data, 'window_seconds')}</DetailRow> : null}
          {total > 0 ? <DetailRow label={t('命中率')}>{`${hit}/${total} (${((hit / total) * 100).toFixed(2)}%)`}</DetailRow> : null}
          {figure(data, 'last_seen_at') > 0 ? <DetailRow label={t('最后上报')}>{dateTime(figure(data, 'last_seen_at'))}</DetailRow> : null}
          {tokens.map(([label, key]) =>
            figure(data, key) > 0 ? (
              <DetailRow key={key} label={label}>
                {figure(data, key).toLocaleString('en-US')}
              </DetailRow>
            ) : null
          )}
        </div>
      ) : null}
    </Modal>
  )
}
