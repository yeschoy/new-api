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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button, Notice, Panel, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { getTwoFactorStatus } from './account-api'
import { SettingRow } from './account-ui'
import { BackupCodesModal, DisableTwoFactorModal } from './two-factor-codes'
import { TwoFactorSetupModal } from './two-factor-setup'

/** The query key of the two-step status, shared with the passkey panel (which needs it for proofs). */
export function useTwoFactorStatus() {
  return useQuery({ queryKey: useConsoleKey('two-factor'), queryFn: getTwoFactorStatus })
}

export function TwoFactorPanel() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const status = useTwoFactorStatus()
  const [dialog, setDialog] = useState<'setup' | 'backup' | 'disable' | null>(null)
  const enabled = Boolean(status.data?.enabled)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['console'] })

  let description = t('登录时除密码外，还需输入验证器 App 生成的动态验证码。')
  if (status.data?.locked) description = t('验证码错误次数过多，已暂时锁定，请稍后再试。')
  else if (enabled) description = t('剩余备用码 {count} 个。', { count: status.data?.backup_codes_remaining ?? 0 })

  let body: React.ReactNode = <p className='text-or-muted text-[14px]'>{t('加载中…')}</p>
  if (status.isError) body = <Notice tone='error'>{errorMessage(status.error, t('获取两步验证状态失败'))}</Notice>
  if (status.data) {
    body = (
      <SettingRow
        title={
          <>
            {t('验证器 App')}
            <Tag tone={enabled ? 'success' : 'neutral'}>{enabled ? t('已启用') : t('未启用')}</Tag>
            {status.data.locked ? <Tag tone='danger'>{t('已锁定')}</Tag> : null}
          </>
        }
        description={description}
      >
        {enabled ? (
          <>
            <Button onClick={() => setDialog('backup')}>{t('重新生成备用码')}</Button>
            <Button variant='danger' onClick={() => setDialog('disable')}>
              {t('关闭两步验证')}
            </Button>
          </>
        ) : (
          <Button variant='primary' onClick={() => setDialog('setup')}>
            {t('启用两步验证')}
          </Button>
        )}
      </SettingRow>
    )
  }

  return (
    <Panel title={t('两步验证')}>
      {body}
      {dialog === 'setup' ? <TwoFactorSetupModal onClose={() => setDialog(null)} onEnabled={refresh} /> : null}
      {dialog === 'backup' ? <BackupCodesModal onClose={() => setDialog(null)} onChanged={refresh} /> : null}
      {dialog === 'disable' ? <DisableTwoFactorModal onClose={() => setDialog(null)} onDisabled={refresh} /> : null}
    </Panel>
  )
}
