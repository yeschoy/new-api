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
import { ShieldCheck, Wrench } from 'lucide-react'

import { Modal, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime } from '@/lib/format'
import { useMoney } from '@/pages/console/console-hooks'

import type { TaskLog } from './log-types'
import { useLogsView } from './logs-context'
import { DetailRow, DetailSection } from './logs-ui'
import { PluginAuthor } from './plugin-author'
import { taskAction, taskStatus } from './task-labels'

/** Everything recorded about one async task; admins and root see more. */
export function TaskDetailsDialog(props: { log: TaskLog; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const view = useLogsView()
  const log = props.log
  const status = taskStatus(log.status)
  const plugin = view.admin ? log.admin_info?.task_plugin : undefined
  const root = view.root ? log.root_info : undefined
  const time = (seconds: number | undefined) => (seconds ? dateTime(seconds) : '—')

  return (
    <Modal
      size='lg'
      onClose={props.onClose}
      title={
        <span className='flex items-center gap-2'>
          {t('任务详情')}
          <Tag tone={status.tone}>{status.text}</Tag>
        </span>
      }
    >
      <div className='flex min-w-0 flex-col gap-4'>
        <DetailSection title={t('基本信息|任务')}>
          <DetailRow label={t('任务 ID')} mono>{log.task_id}</DetailRow>
          <DetailRow label={t('平台')} mono>{log.platform}</DetailRow>
          <DetailRow label={t('任务类型')}>{taskAction(log.action)}</DetailRow>
          <DetailRow label={t('进度')} mono>{log.progress || '—'}</DetailRow>
          <DetailRow label={t('提交时间')} mono>{time(log.submit_time)}</DetailRow>
          <DetailRow label={t('开始时间')} mono>{time(log.start_time)}</DetailRow>
          <DetailRow label={t('完成时间')} mono>{time(log.finish_time)}</DetailRow>
          {log.properties?.origin_model_name ? <DetailRow label={t('原始模型')} mono>{log.properties.origin_model_name}</DetailRow> : null}
          {log.properties?.upstream_model_name ? <DetailRow label={t('实际模型')} mono>{log.properties.upstream_model_name}</DetailRow> : null}
          {log.fail_reason ? <DetailRow label={t('失败原因')}>{log.fail_reason}</DetailRow> : null}
        </DetailSection>

        {view.admin ? (
          <DetailSection title={t('仅管理员可见')} icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}>
            <DetailRow label={t('用户|表头')}>{log.username || String(log.user_id)}</DetailRow>
            <DetailRow label={t('渠道|表头')} mono>{`#${log.channel_id}`}</DetailRow>
            <DetailRow label={t('分组')}>{log.group || '—'}</DetailRow>
            <DetailRow label={t('额度')} mono>{money.format(log.quota)}</DetailRow>
            {log.admin_info?.request_id ? <DetailRow label={t('请求 ID')} mono>{log.admin_info.request_id}</DetailRow> : null}
            {log.admin_info?.request_path ? <DetailRow label={t('请求路径')} mono>{log.admin_info.request_path}</DetailRow> : null}
            {plugin ? (
              <>
                <DetailRow label={t('任务插件|详情')}>{plugin.name || plugin.key}</DetailRow>
                <DetailRow label={t('插件标识')} mono>{plugin.key}</DetailRow>
                <DetailRow label={t('版本')} mono>{plugin.version || '—'}</DetailRow>
                {plugin.author ? (
                  <DetailRow label={t('插件作者')}>
                    <PluginAuthor author={plugin.author} showUrl />
                  </DetailRow>
                ) : null}
              </>
            ) : null}
          </DetailSection>
        ) : null}

        {root ? (
          <DetailSection title={t('Root 诊断')} icon={<Wrench className='size-3.5' aria-hidden='true' />}>
            {root.task_plugin ? <DetailRow label={t('接口版本')} mono>{String(root.task_plugin.api_version)}</DetailRow> : null}
            {root.task_plugin ? <DetailRow label={t('插件代次')} mono>{String(root.task_plugin.generation)}</DetailRow> : null}
            {root.upstream_task_id ? <DetailRow label={t('上游任务 ID')} mono>{root.upstream_task_id}</DetailRow> : null}
            {root.node_name ? <DetailRow label={t('节点名称')} mono>{root.node_name}</DetailRow> : null}
          </DetailSection>
        ) : null}
      </div>
    </Modal>
  )
}
