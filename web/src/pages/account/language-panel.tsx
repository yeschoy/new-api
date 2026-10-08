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
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Panel, Select, toast } from '@/components/ui'
import { LANGUAGES, useI18n, type Lang } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import type { AccountUser } from './account-api'
import { settingLanguage, toLang } from './account-language'
import { SettingRow } from './account-ui'
import { saveLanguage } from './profile-api'

const OPTIONS = LANGUAGES.map((item) => ({ value: item.id, label: item.label }))

/**
 * The interface language, kept in the account: it follows the visitor to other
 * devices at sign-in and sets the language of error messages from the API.
 */
export function LanguagePanel(props: { user: AccountUser | null }) {
  const { t, lang, setLang } = useI18n()
  const queryClient = useQueryClient()
  const selectId = useId()
  const [saving, setSaving] = useState(false)
  const value = settingLanguage(props.user?.setting) ?? lang

  async function onChange(next: string) {
    const chosen = toLang(next)
    if (!chosen || chosen === value) return
    const previous: Lang = lang
    setSaving(true)
    void setLang(chosen)
    try {
      await saveLanguage(chosen)
      toast.success(t('语言偏好已保存'))
      await queryClient.invalidateQueries({ queryKey: ['console'] })
    } catch (err) {
      void setLang(previous)
      toast.error(errorMessage(err, t('保存失败')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title={t('语言偏好')}>
      <SettingRow
        title={<label htmlFor={selectId}>{t('界面语言')}</label>}
        description={t('保存到账户，在其他设备登录时自动使用，也决定接口错误信息的语言。')}
      >
        <Select id={selectId} value={value} onChange={onChange} options={OPTIONS} disabled={saving} className='w-full sm:w-48' />
      </SettingRow>
    </Panel>
  )
}
