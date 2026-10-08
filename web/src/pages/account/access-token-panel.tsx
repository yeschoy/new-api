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
import { useMutation } from '@tanstack/react-query'

import { ConfirmButton, Panel, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { regenerateAccessToken } from './account-api'
import { CopyField, SettingRow } from './account-ui'

/** The system access token (GET /api/user/token): existing ones can't be shown, only replaced. */
export function AccessTokenPanel() {
  const { t } = useI18n()
  const generate = useMutation({
    mutationFn: regenerateAccessToken,
    onError: (err) => toast.error(errorMessage(err, t('生成失败'))),
  })
  return (
    <Panel title={t('访问令牌')}>
      <SettingRow
        title={t('系统访问令牌')}
        description={t('用于通过接口管理账户，与调用模型的 API 密钥不同。出于安全考虑，令牌只在生成时显示一次。')}
      >
        <ConfirmButton question={t('旧令牌将立即失效，确认？')} variant='primary' busy={generate.isPending} onConfirm={() => generate.mutate()}>
          {t('重新生成')}
        </ConfirmButton>
      </SettingRow>
      {generate.data ? (
        <div className='mt-4 flex flex-col gap-2'>
          <CopyField value={generate.data} />
          <p className='text-or-dim text-[12px]'>{t('请立即复制保存，离开页面后将无法再次查看。')}</p>
        </div>
      ) : null}
    </Panel>
  )
}
